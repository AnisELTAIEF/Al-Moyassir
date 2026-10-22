// Établissements (association / mosquée), classes, équipe (إداري / مدرس) et fiches élèves.
// Règle d'autorisation : le rôle est TOUJOURS vérifié dans l'établissement de la route (jamais le rôle global
// seul). L'admin global passe partout. Les élèves n'ont aucun accès à cette zone, hors « lier mon compte ».
// Vie privée (décision D15) : aucune route d'ici ne renvoie les marques personnelles d'un élève.
import { randomInt } from 'node:crypto';
import { HttpError } from '../errors.js';
import { tx } from '../db.js';
import { uuid, sha256, newInvitationCode, normalizeCode } from '../security.js';
import { iso } from '../users.js';
import { orgAccessFor, STUDENT_COLS } from '../orgAccess.js';
import { removeProfileFiles } from '../certFiles.js';
import { runStudentImport } from '../studentImport.js';
import { inviteToOrg } from '../invitations.js';

const RETENTION_YEARS = 5; // D20 : données d'un élève sorti conservées 5 ans au moins
const CODE_TTL_MIN = 15;
const MAX_CODE_ATTEMPTS = 5;
const LINK_TTL_DAYS = 7;

const idParam = { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } };
const idPidParam = { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, pid: { type: 'string', minLength: 36, maxLength: 36 } } };
const idGidParam = { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, gid: { type: 'string', minLength: 36, maxLength: 36 } } };
const dateStr = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const ORG_TYPES = ['association', 'mosque'];
const ROLES = ['admin', 'teacher', 'student'];

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
/** « +218 91 234-5678 » ou « 00218… » (chiffres arabes acceptés) → « +218912345678 ». */
export function normalizePhone(p) {
  if (p == null || String(p).trim() === '') return null;
  let s = String(p).replace(/[٠-٩]/g, (d) => ARABIC_INDIC.indexOf(d)).replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) {
    throw new HttpError(400, 'invalid_phone', 'Numéro invalide : utilisez le format international, par exemple +218 91 234 5678.');
  }
  return s;
}

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);

function validDate(s, { notFuture = false } = {}) {
  if (s == null || s === '') return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new HttpError(400, 'invalid_date', 'Date invalide.');
  if (notFuture && s > today()) throw new HttpError(400, 'invalid_date', 'Cette date ne peut pas être dans le futur.');
  return s;
}

export function ageOf(birth) {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number);
  const n = new Date();
  let age = n.getUTCFullYear() - y;
  if (n.getUTCMonth() + 1 < m || (n.getUTCMonth() + 1 === m && n.getUTCDate() < d)) age--;
  return age;
}

const studentDto = (r, classes = []) => ({
  id: r.id,
  organizationId: r.organization_id,
  fullName: r.full_name,
  fatherName: r.father_name,
  birthDate: r.birth_date,
  age: ageOf(r.birth_date),
  gender: r.gender,
  phone: r.phone,
  phoneVerified: !!r.phone_verified_at,
  guardianPhone: r.guardian_phone ?? null,
  joinedAt: r.joined_at,
  hifdhStartedAt: r.hifdh_started_at,
  pastCompetitions: r.past_competitions ?? '',
  guardianConsentAt: iso(r.guardian_consent_at),
  status: r.status,
  eliteTag: !!r.elite_tag,
  leftAt: r.left_at,
  retainUntil: r.retain_until,
  linked: !!r.user_id,
  classes,
  createdAt: iso(r.created_at),
});

const orgDto = (o, extra = {}) => ({
  id: o.id,
  name: o.name,
  type: o.type,
  address: o.address,
  errorThreshold: Number(o.error_threshold),
  ...extra,
});

export default async function orgRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;

  const { access, studentOf } = orgAccessFor(app);

  async function classesOfStudents(profileIds) {
    if (!profileIds.length) return new Map();
    const [rows] = await db.query(
      `SELECT gs.profile_id, g.id, g.name FROM group_students gs JOIN study_groups g ON g.id = gs.group_id
       WHERE gs.profile_id IN (?) ORDER BY g.name`, [profileIds]);
    const m = new Map();
    for (const r of rows) (m.get(r.profile_id) ?? m.set(r.profile_id, []).get(r.profile_id)).push({ id: r.id, name: r.name });
    return m;
  }

  // ───────────────────────── Établissements ─────────────────────────

  app.get('/', async (req) => {
    const global = req.user.role === 'admin';
    const [rows] = await db.query(
      `SELECT o.*,
              (SELECT GROUP_CONCAT(m.role) FROM org_members m WHERE m.organization_id = o.id AND m.user_id = ?) AS roles,
              (SELECT COUNT(*) FROM student_profiles p WHERE p.organization_id = o.id AND p.status = 'active') AS students,
              (SELECT COUNT(*) FROM study_groups g WHERE g.organization_id = o.id) AS classes
       FROM organizations o
       ${global ? '' : 'WHERE EXISTS (SELECT 1 FROM org_members m WHERE m.organization_id = o.id AND m.user_id = ?)'}
       ORDER BY o.name`, global ? [req.user.id] : [req.user.id, req.user.id]);
    return {
      organizations: rows.map((o) => orgDto(o, {
        roles: o.roles ? o.roles.split(',') : [],
        studentCount: Number(o.students),
        classCount: Number(o.classes),
      })),
    };
  });

  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120 },
          type: { enum: ORG_TYPES },
          address: { type: 'string', maxLength: 255 },
          errorThreshold: { type: 'integer', minimum: 1, maximum: 20 },
          adminEmail: { type: 'string', maxLength: 254 },
        },
      },
    },
  }, async (req) => {
    if (req.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Seul un administrateur global crée un établissement.');
    const b = req.body;
    let adminId = null;
    if (b.adminEmail) {
      const [[u]] = await db.query("SELECT id FROM users WHERE email = ? AND status = 'active'", [b.adminEmail.trim().toLowerCase()]);
      if (!u) throw new HttpError(404, 'user_not_found', 'Aucun compte avec cet e-mail : la personne doit d’abord créer son compte.');
      adminId = u.id;
    }
    const id = uuid();
    await tx(db, async (c) => {
      await c.query('INSERT INTO organizations (id, name, type, address, error_threshold, created_by) VALUES (?,?,?,?,?,?)',
        [id, cleanName(b.name), b.type, cleanName(b.address), b.errorThreshold ?? 3, req.user.id]);
      if (adminId) await c.query("INSERT INTO org_members (organization_id, user_id, role) VALUES (?,?,'admin')", [id, adminId]);
    });
    const [[o]] = await db.query('SELECT * FROM organizations WHERE id = ?', [id]);
    return { organization: orgDto(o, { roles: [], studentCount: 0, classCount: 0 }) };
  });

  app.get('/:id', { schema: { params: idParam } }, async (req) => {
    const { org, roles } = await access(req, req.params.id, ROLES);
    return { organization: orgDto(org, { roles: [...roles] }) };
  });

  app.patch('/:id', {
    schema: {
      params: idParam,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120 },
          type: { enum: ORG_TYPES },
          address: { type: 'string', maxLength: 255 },
          errorThreshold: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    const b = req.body;
    await db.query('UPDATE organizations SET name = ?, type = ?, address = ?, error_threshold = ? WHERE id = ?', [
      b.name != null ? cleanName(b.name) : org.name, b.type ?? org.type, b.address != null ? cleanName(b.address) : org.address,
      b.errorThreshold ?? org.error_threshold, org.id]);
    const [[o]] = await db.query('SELECT * FROM organizations WHERE id = ?', [org.id]);
    return { organization: orgDto(o) };
  });

  // ───────────────────────── Équipe (إداري / مدرس) ─────────────────────────

  app.get('/:id/members', { schema: { params: idParam } }, async (req) => {
    await access(req, req.params.id, ['admin']);
    const [rows] = await db.query(
      `SELECT u.id, u.email, u.display_name, GROUP_CONCAT(m.role ORDER BY m.role) AS roles
       FROM org_members m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ? GROUP BY u.id ORDER BY u.display_name`, [req.params.id]);
    return { members: rows.map((r) => ({ userId: r.id, email: r.email, displayName: r.display_name, roles: r.roles.split(',') })) };
  });

  app.put('/:id/members', {
    schema: { params: idParam, body: { type: 'object', required: ['email', 'role'], properties: { email: { type: 'string', maxLength: 254 }, role: { enum: ROLES } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    const [[u]] = await db.query("SELECT id, email, display_name FROM users WHERE email = ? AND status = 'active'", [req.body.email.trim().toLowerCase()]);
    if (!u) throw new HttpError(404, 'user_not_found', 'Aucun compte avec cet e-mail : la personne doit d’abord créer son compte.');
    await db.query('INSERT IGNORE INTO org_members (organization_id, user_id, role) VALUES (?,?,?)', [org.id, u.id, req.body.role]);
    return { member: { userId: u.id, email: u.email, displayName: u.display_name, role: req.body.role } };
  });

  // Inviter un enseignant (ou un administratif), avec ou SANS e-mail ; éventuellement directement dans une classe.
  // Compte existant : ajouté tout de suite. Sinon : code d'invitation à transmettre (envoyé par e-mail si une adresse est donnée).
  app.post('/:id/invitations', {
    schema: { params: idParam, body: { type: 'object', properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      displayName: { type: 'string', maxLength: 80 },
      role: { enum: ['teacher', 'admin'] },
      classId: { type: ['string', 'null'], maxLength: 36 },
    } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    return inviteToOrg(app, org, { email: req.body.email, displayName: req.body.displayName, orgRole: req.body.role ?? 'teacher', classId: req.body.classId ?? null, invitedBy: req.user.id });
  });

  app.get('/:id/invitations', { schema: { params: idParam } }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    const [rows] = await db.query(
      `SELECT i.id, i.email, i.display_name, i.org_role, i.class_id, c.name AS class_name, i.created_at, i.expires_at, i.emailed_at
       FROM invitations i LEFT JOIN study_groups c ON c.id = i.class_id
       WHERE i.org_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > UTC_TIMESTAMP(3) ORDER BY i.created_at DESC`, [org.id]);
    return { items: rows.map((r) => ({
      id: r.id, email: r.email, displayName: r.display_name, role: r.org_role, classId: r.class_id, className: r.class_name,
      createdAt: iso(r.created_at), expiresAt: iso(r.expires_at), emailedAt: iso(r.emailed_at),
    })) };
  });

  app.delete('/:id/invitations/:iid', {
    schema: { params: { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, iid: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await db.query('UPDATE invitations SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND org_id = ? AND accepted_at IS NULL', [req.params.iid, org.id]);
    return { ok: true };
  });

  app.delete('/:id/members/:uid', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, uid: { type: 'string', minLength: 36, maxLength: 36 } } },
      querystring: { type: 'object', properties: { role: { enum: ROLES } } },
    },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    const { uid } = req.params;
    const role = req.query.role;
    await tx(db, async (c) => {
      if (!role || role === 'admin') {
        // On ne retire jamais le dernier administrateur de l'établissement (il resterait sans responsable local).
        const [[a]] = await c.query(
          "SELECT COUNT(*) AS n, SUM(user_id = ?) AS mine FROM org_members WHERE organization_id = ? AND role = 'admin'", [uid, org.id]);
        if (Number(a.mine) > 0 && Number(a.n) - Number(a.mine) < 1) {
          throw new HttpError(400, 'last_admin', 'Impossible de retirer le dernier administrateur de l’établissement.');
        }
      }
      await c.query(`DELETE FROM org_members WHERE organization_id = ? AND user_id = ?${role ? ' AND role = ?' : ''}`, role ? [org.id, uid, role] : [org.id, uid]);
      if (!role || role === 'teacher') {
        await c.query(
          'DELETE gt FROM group_teachers gt JOIN study_groups g ON g.id = gt.group_id WHERE g.organization_id = ? AND gt.user_id = ?', [org.id, uid]);
      }
    });
    return { ok: true };
  });

  // ───────────────────────── Classes (salle / fawj / halqa) ─────────────────────────

  async function classOf(orgId, gid) {
    const [[g]] = await db.query('SELECT id, name FROM study_groups WHERE id = ? AND organization_id = ?', [gid, orgId]);
    if (!g) throw new HttpError(404, 'not_found', 'Classe introuvable.');
    return g;
  }

  app.get('/:id/classes', { schema: { params: idParam } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const [rows] = await db.query(
      `SELECT g.id, g.name,
              (SELECT COUNT(*) FROM group_students gs JOIN student_profiles p ON p.id = gs.profile_id
                WHERE gs.group_id = g.id AND p.status = 'active') AS students
       FROM study_groups g
       WHERE g.organization_id = ?
         ${ctx.seesAll ? '' : 'AND EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.group_id = g.id AND gt.user_id = ?)'}
       ORDER BY g.name`, ctx.seesAll ? [ctx.org.id] : [ctx.org.id, req.user.id]);
    const [teachers] = await db.query(
      `SELECT gt.group_id, u.id, u.display_name FROM group_teachers gt JOIN users u ON u.id = gt.user_id
       JOIN study_groups g ON g.id = gt.group_id WHERE g.organization_id = ? ORDER BY u.display_name`, [ctx.org.id]);
    return {
      classes: rows.map((g) => ({
        id: g.id,
        name: g.name,
        studentCount: Number(g.students),
        teachers: teachers.filter((t) => t.group_id === g.id).map((t) => ({ userId: t.id, displayName: t.display_name })),
      })),
    };
  });

  app.post('/:id/classes', {
    schema: { params: idParam, body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    const id = uuid();
    // join_open = 0 : une classe d'établissement ne s'ouvre JAMAIS par un code public (données d'enfants).
    await db.query('INSERT INTO study_groups (id, name, organization_id, created_by, join_open) VALUES (?,?,?,?,0)',
      [id, cleanName(req.body.name), org.id, req.user.id]);
    return { class: { id, name: cleanName(req.body.name), studentCount: 0, teachers: [] } };
  });

  app.patch('/:id/classes/:gid', {
    schema: { params: idGidParam, body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await classOf(org.id, req.params.gid);
    await db.query('UPDATE study_groups SET name = ? WHERE id = ?', [cleanName(req.body.name), req.params.gid]);
    return { ok: true };
  });

  app.delete('/:id/classes/:gid', { schema: { params: idGidParam } }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await classOf(org.id, req.params.gid);
    await db.query('DELETE FROM study_groups WHERE id = ?', [req.params.gid]); // les fiches élèves restent, seules les affectations tombent
    return { ok: true };
  });

  app.put('/:id/classes/:gid/teachers', {
    schema: { params: idGidParam, body: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await classOf(org.id, req.params.gid);
    const [ok] = await db.query("SELECT 1 FROM org_members WHERE organization_id = ? AND user_id = ? AND role = 'teacher'", [org.id, req.body.userId]);
    if (!ok.length) throw new HttpError(400, 'not_teacher', 'Cette personne n’a pas le rôle d’enseignant (مدرس) dans cet établissement.');
    await db.query('INSERT IGNORE INTO group_teachers (group_id, user_id) VALUES (?,?)', [req.params.gid, req.body.userId]);
    return { ok: true };
  });

  app.delete('/:id/classes/:gid/teachers/:uid', {
    schema: { params: { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, gid: { type: 'string', minLength: 36, maxLength: 36 }, uid: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await classOf(org.id, req.params.gid);
    await db.query('DELETE FROM group_teachers WHERE group_id = ? AND user_id = ?', [req.params.gid, req.params.uid]);
    return { ok: true };
  });

  app.put('/:id/classes/:gid/students', {
    schema: { params: idGidParam, body: { type: 'object', required: ['profileId'], properties: { profileId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await classOf(org.id, req.params.gid);
    const [[p]] = await db.query('SELECT id FROM student_profiles WHERE id = ? AND organization_id = ?', [req.body.profileId, org.id]);
    if (!p) throw new HttpError(404, 'not_found', 'Élève introuvable.');
    await db.query('INSERT IGNORE INTO group_students (group_id, profile_id) VALUES (?,?)', [req.params.gid, p.id]);
    return { ok: true };
  });

  app.delete('/:id/classes/:gid/students/:pid', {
    schema: { params: { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, gid: { type: 'string', minLength: 36, maxLength: 36 }, pid: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    await classOf(org.id, req.params.gid);
    await db.query('DELETE FROM group_students WHERE group_id = ? AND profile_id = ?', [req.params.gid, req.params.pid]);
    return { ok: true };
  });

  // ───────────────────────── Élèves (fiche administrative) ─────────────────────────

  app.get('/:id/students', {
    schema: {
      params: idParam,
      querystring: {
        type: 'object',
        properties: { q: { type: 'string', maxLength: 80 }, groupId: { type: 'string', minLength: 36, maxLength: 36 }, status: { enum: ['active', 'left', 'all'] } },
      },
    },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const { q, groupId, status = 'active' } = req.query;
    const where = ['p.organization_id = ?'];
    const args = [ctx.org.id];
    if (status !== 'all') { where.push('p.status = ?'); args.push(status); }
    if (q?.trim()) { where.push('(p.full_name LIKE ? OR p.father_name LIKE ? OR p.phone LIKE ? OR p.guardian_phone LIKE ?)'); const like = `%${q.trim()}%`; args.push(like, like, like, like); }
    if (groupId) { where.push('EXISTS (SELECT 1 FROM group_students gs WHERE gs.profile_id = p.id AND gs.group_id = ?)'); args.push(groupId); }
    if (!ctx.seesAll) {
      where.push(`EXISTS (SELECT 1 FROM group_students gs JOIN group_teachers gt ON gt.group_id = gs.group_id
                          WHERE gs.profile_id = p.id AND gt.user_id = ?)`);
      args.push(req.user.id);
    }
    const [rows] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE ${where.join(' AND ')} ORDER BY p.full_name LIMIT 1000`, args);
    const classes = await classesOfStudents(rows.map((r) => r.id));
    return { students: rows.map((r) => studentDto(r, classes.get(r.id) ?? [])) };
  });

  app.post('/:id/students', {
    schema: {
      params: idParam,
      body: {
        type: 'object',
        required: ['fullName'],
        properties: {
          fullName: { type: 'string', minLength: 2, maxLength: 120 },
          fatherName: { type: 'string', maxLength: 80 },
          birthDate: dateStr,
          gender: { enum: ['m', 'f'] },
          phone: { type: 'string', maxLength: 30 },
          guardianPhone: { type: 'string', maxLength: 30 },
          joinedAt: dateStr,
          hifdhStartedAt: dateStr,
          pastCompetitions: { type: 'string', maxLength: 2000 },
          guardianConsent: { type: 'boolean' },
          confirmDuplicate: { type: 'boolean' },
          groupIds: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 36, maxLength: 36 } },
        },
      },
    },
  }, async (req, reply) => {
    const { org } = await access(req, req.params.id, ['admin']);
    const b = req.body;
    const fullName = cleanName(b.fullName), father = cleanName(b.fatherName);
    const phone = normalizePhone(b.phone);
    const guardianPhone = normalizePhone(b.guardianPhone);
    const birth = validDate(b.birthDate, { notFuture: true });
    // L'autorisation des parents n'est exigée que pour un mineur de 14 ans ou moins, ou d'âge inconnu.
    const age = ageOf(birth);
    if ((age == null || age <= 14) && b.guardianConsent !== true) {
      throw new HttpError(400, 'consent_required', 'L’autorisation des parents est obligatoire pour inscrire un élève de 14 ans ou moins (ou d’âge inconnu).');
    }
    const joined = validDate(b.joinedAt);
    const started = validDate(b.hifdhStartedAt);

    // Alerte de doublon (D14) : même nom ET même prénom du père dans l'établissement. Non bloquant si confirmé.
    const [dups] = await db.query(
      'SELECT id, full_name, father_name, status FROM student_profiles WHERE organization_id = ? AND full_name = ? AND father_name = ?', [org.id, fullName, father]);
    if (dups.length && !b.confirmDuplicate) {
      return reply.code(409).send({
        error: 'duplicate',
        message: 'Un élève porte déjà ce nom et ce prénom du père. Confirmez pour créer quand même.',
        duplicates: dups.map((d) => ({ id: d.id, fullName: d.full_name, fatherName: d.father_name, status: d.status })),
      });
    }
    const groupIds = [...new Set(b.groupIds ?? [])];
    if (groupIds.length) {
      const [ok] = await db.query('SELECT id FROM study_groups WHERE organization_id = ? AND id IN (?)', [org.id, groupIds]);
      if (ok.length !== groupIds.length) throw new HttpError(400, 'invalid_class', 'Une des classes choisies n’appartient pas à cet établissement.');
    }
    const id = uuid();
    await tx(db, async (c) => {
      await c.query(
        `INSERT INTO student_profiles (id, organization_id, full_name, father_name, birth_date, gender, phone, guardian_phone, joined_at, hifdh_started_at,
                                       past_competitions, guardian_consent_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,${b.guardianConsent === true ? 'UTC_TIMESTAMP(3)' : 'NULL'},?)`,
        [id, org.id, fullName, father, birth, b.gender ?? null, phone, guardianPhone, joined, started, b.pastCompetitions ?? null, req.user.id]);
      for (const gid of groupIds) await c.query('INSERT INTO group_students (group_id, profile_id) VALUES (?,?)', [gid, id]);
    });
    const [[row]] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE p.id = ?`, [id]);
    return { student: studentDto(row, (await classesOfStudents([id])).get(id) ?? []) };
  });

  // Import en masse de fiches (TXT/CSV) ; dryRun (par défaut) : simulation sans rien créer.
  app.post('/:id/students/import', {
    bodyLimit: 1_048_576,
    schema: {
      params: idParam,
      body: { type: 'object', required: ['text'], properties: {
        text: { type: 'string', maxLength: 500_000 },
        dryRun: { type: 'boolean' },
        guardianConsent: { type: 'boolean' },
        createClasses: { type: 'boolean' },
        groupId: { type: ['string', 'null'], maxLength: 36 },
      } },
    },
  }, async (req) => {
    const { org } = await access(req, req.params.id, ['admin']);
    return runStudentImport(app, org, {
      text: req.body.text, dryRun: req.body.dryRun !== false, guardianConsent: req.body.guardianConsent === true,
      createClasses: req.body.createClasses === true, groupId: req.body.groupId ?? null, userId: req.user.id,
    });
  });

  app.get('/:id/students/:pid', { schema: { params: idPidParam } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const row = await studentOf(req, ctx, req.params.pid);
    return { student: studentDto(row, (await classesOfStudents([row.id])).get(row.id) ?? []) };
  });

  app.patch('/:id/students/:pid', {
    schema: {
      params: idPidParam,
      body: {
        type: 'object',
        properties: {
          fullName: { type: 'string', minLength: 2, maxLength: 120 },
          fatherName: { type: 'string', maxLength: 80 },
          birthDate: { anyOf: [dateStr, { type: 'null' }] },
          gender: { enum: ['m', 'f', null] },
          phone: { type: ['string', 'null'], maxLength: 30 },
          guardianPhone: { type: ['string', 'null'], maxLength: 30 },
          joinedAt: { anyOf: [dateStr, { type: 'null' }] },
          hifdhStartedAt: { anyOf: [dateStr, { type: 'null' }] },
          pastCompetitions: { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const cur = await studentOf(req, ctx, req.params.pid);
    const b = req.body;
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    const phone = has('phone') ? normalizePhone(b.phone) : cur.phone;
    const phoneChanged = has('phone') && phone !== cur.phone;
    const guardianPhone = has('guardianPhone') ? normalizePhone(b.guardianPhone) : cur.guardian_phone;
    await tx(db, async (c) => {
      await c.query(
        `UPDATE student_profiles SET full_name = ?, father_name = ?, birth_date = ?, gender = ?, phone = ?, guardian_phone = ?, phone_verified_at = ${phoneChanged ? 'NULL' : 'phone_verified_at'},
                joined_at = ?, hifdh_started_at = ?, past_competitions = ? WHERE id = ?`,
        [
          has('fullName') ? cleanName(b.fullName) : cur.full_name,
          has('fatherName') ? cleanName(b.fatherName) : cur.father_name,
          has('birthDate') ? validDate(b.birthDate, { notFuture: true }) : cur.birth_date,
          has('gender') ? b.gender : cur.gender,
          phone,
          guardianPhone,
          has('joinedAt') ? validDate(b.joinedAt) : cur.joined_at,
          has('hifdhStartedAt') ? validDate(b.hifdhStartedAt) : cur.hifdh_started_at,
          has('pastCompetitions') ? b.pastCompetitions : cur.past_competitions,
          cur.id,
        ]);
      // Un numéro modifié n'est plus vérifié, et tout code en attente pour l'ancien numéro tombe (D3).
      if (phoneChanged) await c.query('DELETE FROM phone_verifications WHERE profile_id = ?', [cur.id]);
    });
    const [[row]] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE p.id = ?`, [cur.id]);
    return { student: studentDto(row, (await classesOfStudents([cur.id])).get(cur.id) ?? []) };
  });

  // Sortie d'un élève : archivage (jamais de suppression d'office), conservation 5 ans au moins (D20).
  // Étiquette « ضمن النخبة » : posée ou retirée par l'équipe (administratif ou enseignant).
  app.put('/:id/students/:pid/elite', {
    schema: { params: idPidParam, body: { type: 'object', required: ['elite'], properties: { elite: { type: 'boolean' } } } },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const cur = await studentOf(req, ctx, req.params.pid);
    await db.query('UPDATE student_profiles SET elite_tag = ? WHERE id = ?', [req.body.elite ? 1 : 0, cur.id]);
    const [[row]] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE p.id = ?`, [cur.id]);
    return { student: studentDto(row, (await classesOfStudents([cur.id])).get(cur.id) ?? []) };
  });

  app.post('/:id/students/:pid/leave', { schema: { params: idPidParam } }, async (req) => {
    // Corps facultatif : { leftAt: 'YYYY-MM-DD' } (sinon aujourd'hui). La date est validée par validDate.
    if (req.body != null && typeof req.body !== 'object') throw new HttpError(400, 'invalid_request', 'Corps invalide.');
    const ctx = await access(req, req.params.id, ['admin']);
    const cur = await studentOf(req, ctx, req.params.pid);
    const leftAt = validDate(req.body?.leftAt) ?? today();
    await db.query(`UPDATE student_profiles SET status = 'left', left_at = ?, retain_until = DATE_ADD(?, INTERVAL ${RETENTION_YEARS} YEAR) WHERE id = ?`, [leftAt, leftAt, cur.id]);
    const [[row]] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE p.id = ?`, [cur.id]);
    return { student: studentDto(row) };
  });

  app.post('/:id/students/:pid/restore', { schema: { params: idPidParam } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const cur = await studentOf(req, ctx, req.params.pid);
    await db.query("UPDATE student_profiles SET status = 'active', left_at = NULL, retain_until = NULL WHERE id = ?", [cur.id]);
    const [[row]] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE p.id = ?`, [cur.id]);
    return { student: studentDto(row) };
  });

  // Suppression définitive : admin global seulement, et seulement une fois la durée de conservation écoulée.
  app.delete('/:id/students/:pid', { schema: { params: idPidParam } }, async (req) => {
    if (req.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Seul un administrateur global peut supprimer définitivement une fiche.');
    const ctx = await access(req, req.params.id, ['admin']);
    const cur = await studentOf(req, ctx, req.params.pid);
    if (cur.status !== 'left' || !cur.retain_until || cur.retain_until > today()) {
      throw new HttpError(409, 'retention', `Cette fiche doit être conservée jusqu’au ${cur.retain_until ?? '—'} (au moins ${RETENTION_YEARS} ans après la sortie de l’élève).`);
    }
    await removeProfileFiles(db, app.cfg, cur.id); // les fichiers de certificats partent avec la fiche
    await db.query('DELETE FROM student_profiles WHERE id = ?', [cur.id]);
    return { ok: true };
  });

  // ───────────────────────── Téléphone : code à usage unique (D3, phase 1) ─────────────────────────

  const codeHash = (pid, code) => sha256(`${pid}:${code}`);

  app.post('/:id/students/:pid/phone-code', { schema: { params: idPidParam } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const cur = await studentOf(req, ctx, req.params.pid);
    if (!cur.phone) throw new HttpError(400, 'no_phone', 'Cette fiche n’a pas de numéro de téléphone.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expires = new Date(Date.now() + CODE_TTL_MIN * 60_000);
    await db.query(
      `INSERT INTO phone_verifications (profile_id, phone, code_hash, expires_at, attempts) VALUES (?,?,?,?,0)
       ON DUPLICATE KEY UPDATE phone = VALUES(phone), code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0`,
      [cur.id, cur.phone, codeHash(cur.id, code), expires]);
    // Le code est remis à l'équipe, qui l'envoie à l'élève par WhatsApp (lien wa.me construit par le BO).
    return { code, phone: cur.phone, expiresAt: expires.toISOString() };
  });

  app.post('/:id/students/:pid/phone-verify', {
    schema: { params: idPidParam, body: { type: 'object', required: ['code'], properties: { code: { type: 'string', maxLength: 12 } } } },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const cur = await studentOf(req, ctx, req.params.pid);
    const [[v]] = await db.query('SELECT phone, code_hash, expires_at, attempts FROM phone_verifications WHERE profile_id = ?', [cur.id]);
    const invalid = new HttpError(400, 'invalid_code', 'Code incorrect ou expiré.');
    if (!v || v.phone !== cur.phone || new Date(v.expires_at) < new Date() || v.attempts >= MAX_CODE_ATTEMPTS) throw invalid;
    if (v.code_hash !== codeHash(cur.id, String(req.body.code).replace(/\D/g, ''))) {
      await db.query('UPDATE phone_verifications SET attempts = attempts + 1 WHERE profile_id = ?', [cur.id]);
      throw invalid;
    }
    await tx(db, async (c) => {
      await c.query('UPDATE student_profiles SET phone_verified_at = UTC_TIMESTAMP(3) WHERE id = ?', [cur.id]);
      await c.query('DELETE FROM phone_verifications WHERE profile_id = ?', [cur.id]);
    });
    return { ok: true, phoneVerified: true };
  });

  // ───────────────────────── Rattachement d'un compte à une fiche (D17) ─────────────────────────

  app.post('/:id/students/:pid/link-code', { schema: { params: idPidParam } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const cur = await studentOf(req, ctx, req.params.pid);
    if (cur.status !== 'active') throw new HttpError(409, 'student_left', 'Cet élève est sorti de l’établissement.');
    const code = newInvitationCode();
    const expires = new Date(Date.now() + LINK_TTL_DAYS * 86_400_000);
    await db.query('UPDATE student_profiles SET link_code_hash = ?, link_expires_at = ? WHERE id = ?', [sha256(normalizeCode(code)), expires, cur.id]);
    return { code, expiresAt: expires.toISOString() };
  });

  app.post('/:id/students/:pid/unlink', { schema: { params: idPidParam } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const cur = await studentOf(req, ctx, req.params.pid);
    await tx(db, async (c) => {
      await c.query('UPDATE student_profiles SET user_id = NULL, link_code_hash = NULL, link_expires_at = NULL WHERE id = ?', [cur.id]);
      if (cur.user_id) {
        // Le rôle « élève » ne reste que si la personne a encore une autre fiche dans cet établissement.
        const [other] = await c.query('SELECT 1 FROM student_profiles WHERE organization_id = ? AND user_id = ? LIMIT 1', [ctx.org.id, cur.user_id]);
        if (!other.length) await c.query("DELETE FROM org_members WHERE organization_id = ? AND user_id = ? AND role = 'student'", [ctx.org.id, cur.user_id]);
      }
    });
    return { ok: true };
  });

  // Le parent (ou l'élève) saisit le code remis par l'administratif : son compte est rattaché à la fiche.
  app.post('/link-student', {
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', maxLength: 20 } } } },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req) => {
    const hash = sha256(normalizeCode(req.body.code));
    const result = await tx(db, async (c) => {
      const [[p]] = await c.query(
        `SELECT p.id, p.organization_id, p.user_id, p.full_name, o.name AS org_name, o.type AS org_type
         FROM student_profiles p JOIN organizations o ON o.id = p.organization_id
         WHERE p.link_code_hash = ? AND p.link_expires_at > UTC_TIMESTAMP(3) AND p.status = 'active' FOR UPDATE`, [hash]);
      if (!p) throw new HttpError(400, 'invalid_code', 'Code invalide ou expiré. Demandez-en un nouveau à l’administration.');
      if (p.user_id && p.user_id !== req.user.id) throw new HttpError(409, 'already_linked', 'Cette fiche est déjà rattachée à un autre compte.');
      await c.query('UPDATE student_profiles SET user_id = ?, link_code_hash = NULL, link_expires_at = NULL WHERE id = ?', [req.user.id, p.id]);
      await c.query("INSERT IGNORE INTO org_members (organization_id, user_id, role) VALUES (?,?,'student')", [p.organization_id, req.user.id]);
      return p;
    });
    return {
      organization: { id: result.organization_id, name: result.org_name, type: result.org_type },
      student: { id: result.id, fullName: result.full_name },
    };
  });
}
