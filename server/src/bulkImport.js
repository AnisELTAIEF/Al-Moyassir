// Import en masse d'utilisateurs depuis un fichier TXT ou CSV.
//
// Deux formats (une personne par ligne ; séparateur « ; », tabulation ou « , ») :
//   - import dans un groupe :   Nom complet ; e-mail
//   - import général (admin) :  Groupe ; Nom complet ; e-mail ; rôle
//     rôle : « membre » (par défaut) ou « admin » (admin du groupe). Groupe vide = sans groupe.
// Les lignes vides, les lignes commençant par # et une ligne d'en-tête (sans e-mail) sont ignorées.
//
// Pour chaque ligne : si la personne a déjà un compte, elle est ajoutée au groupe ; sinon elle est
// invitée (code personnel, e-mail envoyé automatiquement si le SMTP est configuré).
import { HttpError } from './errors.js';
import { uuid } from './security.js';
import { assignGroupCode } from './groupCodes.js';
import { createInvitation, sendInvitationMail } from './invitations.js';
import { mailEnabled } from './mailer.js';

export const MAX_IMPORT_LINES = 1000;

/** Envoi en cours des e-mails du dernier import (utile aux tests). */
export let lastImportMailing = Promise.resolve();
const EMAIL = /^[^\s@;,<>"]+@[^\s@;,<>"]+\.[^\s@;,<>"]+$/;

const ROLE_WORDS = {
  admin: ['admin', 'administrateur', 'administratrice', 'admin de groupe', 'admin du groupe', 'responsable', 'gestionnaire', 'manager', 'مشرف', 'مسؤول'],
  member: ['', 'membre', 'member', 'utilisateur', 'utilisatrice', 'user', 'simple', 'élève', 'eleve', 'étudiant', 'etudiant', 'عضو'],
};

/** Rôle dans le groupe à partir du texte libre, ou null si non reconnu. */
export function parseRole(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (ROLE_WORDS.admin.includes(t)) return 'admin';
  if (ROLE_WORDS.member.includes(t)) return 'member';
  return null;
}

function splitLine(line) {
  const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
  return line.split(sep).map((f) => f.trim().replace(/^"(.*)"$/, '$1').trim());
}

/**
 * Analyse le texte importé.
 * @param {string} text
 * @param {{ withGroup: boolean }} opts  withGroup : format général (colonne Groupe et rôle)
 * @returns {{ rows: Array<{line:number, group:string|null, name:string|null, email:string, role:'admin'|'member'}>,
 *             errors: Array<{line:number, text:string, message:string}> }}
 */
export function parseImport(text, { withGroup }) {
  const rows = [];
  const errors = [];
  const seen = new Map();
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  let counted = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line || line.startsWith('#')) return;
    if (!line.includes('@')) {
      // En-tête (« Nom ; E-mail ») ou ligne sans adresse.
      if (counted === 0 && !errors.length && /mail|courriel|adresse|البريد/i.test(line)) return;
      errors.push({ line: n, text: line, message: 'Adresse e-mail manquante.' });
      return;
    }
    if (++counted > MAX_IMPORT_LINES) {
      if (counted === MAX_IMPORT_LINES + 1) errors.push({ line: n, text: line, message: `Au-delà de ${MAX_IMPORT_LINES} lignes : découpez le fichier.` });
      return;
    }
    const f = splitLine(line);
    const at = f.findIndex((x) => x.includes('@'));
    const email = f[at].toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) {
      errors.push({ line: n, text: line, message: `Adresse e-mail invalide : ${f[at]}` });
      return;
    }
    const before = f.slice(0, at);
    const after = f.slice(at + 1).filter((x) => x !== '');
    let group = null;
    let name;
    let role = 'member';
    if (withGroup) {
      if (before.length < 2) {
        errors.push({ line: n, text: line, message: 'Format attendu : Groupe ; Nom complet ; e-mail ; rôle (laissez le groupe vide pour « sans groupe »).' });
        return;
      }
      group = before[0] || null;
      name = before.slice(1).join(' ').trim();
      if (after.length) {
        role = parseRole(after[0]);
        if (!role) {
          errors.push({ line: n, text: line, message: `Rôle inconnu : « ${after[0]} » (membre ou admin).` });
          return;
        }
        if (!group && role === 'admin') {
          errors.push({ line: n, text: line, message: 'Un admin de groupe doit avoir un groupe.' });
          return;
        }
      }
      if (group && (group.length < 2 || group.length > 80)) {
        errors.push({ line: n, text: line, message: 'Nom de groupe : 2 à 80 caractères.' });
        return;
      }
    } else {
      // « Nom ; e-mail » ou « e-mail ; Nom » (les deux ordres sont acceptés).
      name = [...before, ...after].join(' ').trim();
    }
    const key = `${(group ?? '').toLowerCase()}|${email}`;
    if (seen.has(key)) {
      errors.push({ line: n, text: line, message: `En double (déjà ligne ${seen.get(key)}).` });
      return;
    }
    seen.set(key, n);
    rows.push({ line: n, group, name: name ? name.slice(0, 80) : null, email, role });
  });
  return { rows, errors };
}

/**
 * Exécute l'import (ou le simule si dryRun).
 * @param {object} opts
 * @param {string|null} opts.groupId  import dans un groupe précis (format sans colonne Groupe)
 * @param {boolean} opts.createGroups  crée les groupes absents (import général)
 */
export async function runImport(app, { text, withGroup, groupId = null, createGroups = false, dryRun = true, invitedBy }) {
  const { rows, errors } = parseImport(text, { withGroup });
  if (!rows.length && !errors.length) throw new HttpError(400, 'empty_import', 'Le fichier ne contient aucune ligne à importer.');

  const groups = new Map(); // nom en minuscules → { id, name, created }
  let fixedGroup = null;
  if (groupId) {
    const [g] = await app.db.query('SELECT id, name FROM study_groups WHERE id = ?', [groupId]);
    if (!g[0]) throw new HttpError(404, 'not_found', 'Groupe introuvable.');
    fixedGroup = { id: g[0].id, name: g[0].name, created: false };
  }
  const groupsCreated = [];

  async function resolveGroup(name) {
    const k = name.toLowerCase();
    if (groups.has(k)) return groups.get(k);
    const [g] = await app.db.query('SELECT id, name FROM study_groups WHERE name = ? ORDER BY created_at LIMIT 1', [name]);
    let found = g[0] ? { id: g[0].id, name: g[0].name, created: false } : null;
    if (!found) {
      if (!createGroups) throw new HttpError(400, 'invalid_group', `Groupe introuvable : ${name}`);
      groupsCreated.push(name);
      if (dryRun) {
        found = { id: null, name, created: true };
      } else {
        const id = uuid();
        await app.db.query('INSERT INTO study_groups (id, name, created_by) VALUES (?, ?, ?)', [id, name, invitedBy]);
        await assignGroupCode(app.db, id);
        found = { id, name, created: true };
      }
    }
    groups.set(k, found);
    return found;
  }

  const items = errors.map((e) => ({ line: e.line, email: null, name: null, group: null, role: null, action: 'error', message: e.message, text: e.text }));
  const mails = [];
  const invitedNow = new Set(); // une seule invitation envoyée par personne, même si plusieurs groupes
  for (const r of rows) {
    const item = { line: r.line, email: r.email, name: r.name, group: null, role: r.role, action: 'error', message: '' };
    items.push(item);
    try {
      const g = fixedGroup ?? (r.group ? await resolveGroup(r.group) : null);
      item.group = g?.name ?? null;
      const [u] = await app.db.query('SELECT id, display_name, status FROM users WHERE email = ?', [r.email]);
      if (u[0]) {
        if (u[0].status !== 'active') { item.message = 'Compte désactivé : non ajouté.'; continue; }
        if (!g) { item.action = 'unchanged'; item.message = 'A déjà un compte.'; continue; }
        const [m] = g.id
          ? await app.db.query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [g.id, u[0].id])
          : [[]];
        const current = m[0]?.role;
        if (current === 'admin' || current === r.role) {
          item.action = 'unchanged';
          item.message = current === 'admin' ? 'Déjà admin du groupe.' : 'Déjà membre du groupe.';
          continue;
        }
        if (!dryRun) {
          await app.db.query(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
            [g.id, u[0].id, r.role]);
        }
        item.action = current ? 'updated' : 'added';
        item.message = current ? 'Nommé(e) admin du groupe.' : `Compte existant ajouté au groupe${r.role === 'admin' ? ' (admin)' : ''}.`;
        continue;
      }
      // Pas encore de compte : invitation, sauf si une invitation est déjà en cours pour ce groupe.
      const [p] = await app.db.query(
        `SELECT id FROM invitations WHERE email = ? AND (group_id <=> ?) AND accepted_at IS NULL
           AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`, [r.email, g?.id ?? null]);
      if (p[0]) { item.action = 'unchanged'; item.message = 'Invitation déjà en cours.'; continue; }
      item.action = 'invited';
      if (dryRun) { item.message = 'Sera invité(e).'; continue; }
      const inv = await createInvitation(app, {
        email: r.email, role: 'user', groupId: g?.id ?? null, groupRole: g ? r.role : 'member',
        invitedBy, displayName: r.name, deferMail: true,
      });
      item.code = inv.code;
      item.link = inv.link;
      if (invitedNow.has(r.email)) {
        item.message = 'Rejoindra aussi ce groupe en créant son compte (une seule invitation lui est envoyée).';
      } else {
        invitedNow.add(r.email);
        item.message = 'Invité(e).';
        if (mailEnabled(app.cfg)) mails.push({ id: inv.id, email: r.email, mail: inv.pendingMail });
      }
    } catch (e) {
      item.action = 'error';
      item.message = e instanceof HttpError ? e.message : 'Erreur inattendue.';
      if (!(e instanceof HttpError)) app.log.error(e);
    }
  }
  items.sort((a, b) => a.line - b.line);

  // E-mails envoyés en arrière-plan, l'un après l'autre (la réponse n'attend pas l'envoi).
  const mailing = mails.length
    ? (async () => { for (const m of mails) await sendInvitationMail(app, m.id, m.email, m.mail); })()
        .catch((e) => app.log.error(e))
    : Promise.resolve();
  lastImportMailing = mailing;

  const count = (a) => items.filter((x) => x.action === a).length;
  return {
    dryRun,
    summary: {
      added: count('added'), updated: count('updated'), invited: count('invited'),
      unchanged: count('unchanged'), errors: count('error'),
      groupsCreated: [...new Set(groupsCreated)],
    },
    emailing: mails.length,
    mailConfigured: mailEnabled(app.cfg),
    items,
  };
}
