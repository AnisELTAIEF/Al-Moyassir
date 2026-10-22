// Import en masse de fiches d'élèves d'un établissement (fichier TXT ou CSV).
//
// Une fiche par ligne ; séparateur « ; », tabulation ou « , ». Colonnes, dans cet ordre (seul le nom est obligatoire) :
//   Nom complet ; Prénom du père ; Date de naissance ; Sexe ; Téléphone de l'élève ; Téléphone du parent ; Classe
//   - date : AAAA-MM-JJ ou JJ/MM/AAAA ; sexe : m / f (garçon, fille, ذكر, أنثى) ;
//   - téléphones : format international (+218 91 234 5678) ;
//   - classe : le nom d'une classe de l'établissement (créée si l'option est cochée).
// Les lignes vides, celles qui commencent par # et la ligne d'en-tête sont ignorées. Un élève déjà inscrit
// (même nom ET même prénom du père) n'est pas recréé. L'autorisation des parents doit être confirmée pour
// tout élève de 14 ans ou moins (ou d'âge inconnu), comme pour une fiche créée à la main.
import { HttpError } from './errors.js';
import { tx } from './db.js';
import { uuid } from './security.js';
import { normalizePhone, ageOf } from './routes/orgs.js';

export const MAX_STUDENT_LINES = 1000;

const MALE = ['m', 'male', 'masculin', 'garçon', 'garcon', 'g', 'h', 'homme', 'ذكر'];
const FEMALE = ['f', 'female', 'féminin', 'feminin', 'fille', 'femme', 'أنثى', 'انثى'];
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function splitLine(line) {
  const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
  return line.split(sep).map((f) => f.trim().replace(/^"(.*)"$/, '$1').trim());
}

/** « 2012-05-03 », « 03/05/2012 » ou « 3-5-2012 » → « 2012-05-03 » ; null si vide ; lève une erreur sinon. */
export function parseDate(s) {
  const t = clean(s);
  if (!t) return null;
  let y, m, d;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, y, m, d] = r;
  else if ((r = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) [, d, m, y] = r;
  else throw new Error(`Date invalide : « ${t} » (AAAA-MM-JJ ou JJ/MM/AAAA).`);
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) throw new Error(`Date invalide : « ${t} ».`);
  if (iso > new Date().toISOString().slice(0, 10)) throw new Error('La date de naissance ne peut pas être dans le futur.');
  return iso;
}

function parseGender(s) {
  const t = clean(s).toLowerCase();
  if (!t) return null;
  if (MALE.includes(t)) return 'm';
  if (FEMALE.includes(t)) return 'f';
  throw new Error(`Sexe inconnu : « ${s} » (m ou f).`);
}

/** @returns {{ rows: object[], errors: {line:number, text:string, message:string}[] }} */
export function parseStudentImport(text) {
  const rows = [];
  const errors = [];
  const seen = new Map();
  let counted = 0;
  String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line || line.startsWith('#')) return;
    const f = splitLine(line);
    // En-tête (« Nom ; Père ; Naissance… ») : première ligne qui parle de colonnes.
    if (counted === 0 && !rows.length && !errors.length && /^(nom|élève|eleve|الاسم|الطالب|name)/i.test(f[0]) && /(père|pere|naissance|classe|téléphone|telephone|الأب|الهاتف)/i.test(line)) return;
    if (++counted > MAX_STUDENT_LINES) {
      if (counted === MAX_STUDENT_LINES + 1) errors.push({ line: n, text: line, message: `Au-delà de ${MAX_STUDENT_LINES} lignes : découpez le fichier.` });
      return;
    }
    try {
      const fullName = clean(f[0]);
      if (fullName.length < 2 || fullName.length > 120) throw new Error('Nom complet : 2 à 120 caractères.');
      const father = clean(f[1]);
      if (father.length > 80) throw new Error('Prénom du père : 80 caractères au plus.');
      const row = {
        line: n, fullName, father,
        birthDate: parseDate(f[2]),
        gender: parseGender(f[3]),
        phone: normalizePhone(f[4]),
        guardianPhone: normalizePhone(f[5]),
        className: clean(f[6]) || null,
      };
      if (row.className && row.className.length > 80) throw new Error('Nom de classe : 80 caractères au plus.');
      const key = `${fullName.toLowerCase()}|${father.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`En double dans le fichier (déjà ligne ${seen.get(key)}).`);
      seen.set(key, n);
      rows.push(row);
    } catch (e) {
      errors.push({ line: n, text: line, message: e.message });
    }
  });
  return { rows, errors };
}

/**
 * Exécute l'import (ou le simule si dryRun).
 * @param {object} opts  guardianConsent : les parents des mineurs ont autorisé l'enregistrement ;
 *   createClasses : crée les classes absentes ; groupId : classe imposée (prioritaire sur la colonne Classe).
 */
export async function runStudentImport(app, org, { text, dryRun = true, guardianConsent = false, createClasses = false, groupId = null, userId }) {
  const { rows, errors } = parseStudentImport(text);
  if (!rows.length && !errors.length) throw new HttpError(400, 'empty_import', 'Le fichier ne contient aucune ligne à importer.');
  const db = app.db;

  let fixed = null;
  if (groupId) {
    const [g] = await db.query('SELECT id, name FROM study_groups WHERE id = ? AND organization_id = ?', [groupId, org.id]);
    if (!g[0]) throw new HttpError(400, 'invalid_class', 'Cette classe n’appartient pas à cet établissement.');
    fixed = g[0];
  }
  const classes = new Map(); // nom en minuscules → { id|null, name, created }
  const classesCreated = [];
  async function classOf(name) {
    const k = name.toLowerCase();
    if (classes.has(k)) return classes.get(k);
    const [g] = await db.query('SELECT id, name FROM study_groups WHERE organization_id = ? AND name = ? LIMIT 1', [org.id, name]);
    let found = g[0] ? { id: g[0].id, name: g[0].name } : null;
    if (!found) {
      if (!createClasses) throw new Error(`Classe introuvable : « ${name} » (cochez « créer les classes absentes »).`);
      classesCreated.push(name);
      found = { id: null, name };
      if (!dryRun) {
        const id = uuid();
        await db.query('INSERT INTO study_groups (id, name, organization_id, created_by, join_open) VALUES (?,?,?,?,0)', [id, name, org.id, userId]);
        found.id = id;
      }
    }
    classes.set(k, found);
    return found;
  }

  const items = errors.map((e) => ({ line: e.line, name: null, className: null, action: 'error', message: e.message, text: e.text }));
  for (const r of rows) {
    const item = { line: r.line, name: r.fullName, className: null, action: 'error', message: '' };
    items.push(item);
    try {
      const age = ageOf(r.birthDate);
      if ((age == null || age <= 14) && !guardianConsent) {
        item.message = 'Autorisation des parents non confirmée (obligatoire jusqu’à 14 ans ou si l’âge est inconnu).';
        continue;
      }
      const [dups] = await db.query('SELECT id FROM student_profiles WHERE organization_id = ? AND full_name = ? AND father_name = ? LIMIT 1', [org.id, r.fullName, r.father]);
      const cls = fixed ?? (r.className ? await classOf(r.className) : null);
      item.className = cls?.name ?? null;
      if (dups[0]) {
        item.action = 'unchanged';
        item.message = 'Déjà inscrit(e).';
        // Une fiche existante peut au moins rejoindre la classe indiquée.
        if (cls?.id && !dryRun) await db.query('INSERT IGNORE INTO group_students (group_id, profile_id) VALUES (?,?)', [cls.id, dups[0].id]);
        continue;
      }
      item.action = 'created';
      item.message = 'Fiche créée.';
      if (dryRun) { item.message = 'Sera créée.'; continue; }
      const id = uuid();
      await tx(db, async (c) => {
        await c.query(
          `INSERT INTO student_profiles (id, organization_id, full_name, father_name, birth_date, gender, phone, guardian_phone, joined_at,
                                         guardian_consent_at, created_by)
           VALUES (?,?,?,?,?,?,?,?,UTC_DATE(),${guardianConsent ? 'UTC_TIMESTAMP(3)' : 'NULL'},?)`,
          [id, org.id, r.fullName, r.father, r.birthDate, r.gender, r.phone, r.guardianPhone, userId]);
        if (cls?.id) await c.query('INSERT INTO group_students (group_id, profile_id) VALUES (?,?)', [cls.id, id]);
      });
    } catch (e) {
      item.action = 'error';
      item.message = e instanceof HttpError || e instanceof Error ? e.message : 'Erreur inattendue.';
      if (!(e instanceof HttpError) && !/^(Classe|Date|Sexe|Nom)/.test(e.message)) app.log.error(e);
    }
  }
  items.sort((a, b) => a.line - b.line);
  const count = (a) => items.filter((x) => x.action === a).length;
  return {
    dryRun,
    summary: { created: count('created'), unchanged: count('unchanged'), errors: count('error'), classesCreated: [...new Set(classesCreated)] },
    items,
  };
}
