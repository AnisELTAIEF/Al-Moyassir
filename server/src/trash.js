// Corbeille à deux niveaux. Avant toute suppression, l'objet est mis de côté (instantané JSON) :
//   - niveau 1 : 30 premiers jours, restauration par l'administratif de l'établissement ;
//   - niveau 2 : 30 jours suivants, restauration par l'admin global seulement ;
//   - au-delà de 60 jours : suppression définitive (purge quotidienne).
// Les fiches élèves ne passent pas par ici : elles sont archivées (« sortie ») et conservées 5 ans (D20).
import { HttpError } from './errors.js';
import { uuid } from './security.js';
import { assignGroupCode } from './groupCodes.js';

export const LEVEL1_DAYS = 30;
export const TOTAL_DAYS = 60;
const DAY = 86_400_000;

export const KINDS = {
  class: 'Classe', group: 'Groupe', member: 'Enseignant / administratif retiré', invitation: 'Invitation',
  assessment: 'Examen ou concours', reward: 'Encouragement ou cadeau',
};

/** Les dates deviennent des chaînes « AAAA-MM-JJ hh:mm:ss.mmm » (UTC), seules acceptées en retour par la base. */
const plain = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString().replace('T', ' ').replace('Z', '') : v]));

async function rows(db, sql, args) {
  const [r] = await db.query(sql, args);
  return r.map(plain);
}

/** Insère une ligne (colonnes de l'instantané) ; false si la clé existe déjà. */
async function insertRow(db, table, row) {
  const cols = Object.keys(row);
  const [r] = await db.query(`INSERT IGNORE INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]));
  return r.affectedRows > 0;
}

/** Met un objet de côté. `db` : pool ou connexion. */
export async function toTrash(db, { kind, orgId = null, label, payload, by = null }) {
  const id = uuid();
  await db.query('INSERT INTO trash (id, kind, organization_id, label, payload, deleted_by) VALUES (?,?,?,?,?,?)',
    [id, kind, orgId, String(label).slice(0, 200), JSON.stringify(payload), by]);
  return id;
}

/** Instantané d'une classe ou d'un groupe avec ses liens, juste avant sa suppression. */
export async function trashGroup(db, groupId, { by, orgId = null }) {
  const [g] = await rows(db, 'SELECT * FROM study_groups WHERE id = ?', [groupId]);
  if (!g) return null;
  const teachers = await rows(db, 'SELECT user_id FROM group_teachers WHERE group_id = ?', [groupId]);
  const students = await rows(db, 'SELECT profile_id FROM group_students WHERE group_id = ?', [groupId]);
  const members = await rows(db, 'SELECT user_id, role FROM group_members WHERE group_id = ?', [groupId]);
  return toTrash(db, { kind: g.organization_id ? 'class' : 'group', orgId: g.organization_id ?? orgId, label: g.name, by, payload: { group: g, teachers, students, members } });
}

/** Un rôle d'équipe retiré (avec ses classes), avant la suppression. */
export async function trashMember(db, { orgId, userId, role, by }) {
  const [u] = await rows(db, 'SELECT display_name, email FROM users WHERE id = ?', [userId]);
  const classes = role === 'admin' ? [] : await rows(db, 'SELECT gt.group_id FROM group_teachers gt JOIN study_groups g ON g.id = gt.group_id WHERE g.organization_id = ? AND gt.user_id = ?', [orgId, userId]);
  return toTrash(db, { kind: 'member', orgId, by, label: `${u?.display_name ?? userId} (${role === 'admin' ? 'administratif' : 'enseignant'})`, payload: { userId, role, classIds: classes.map((c) => c.group_id) } });
}

export async function trashRow(db, { kind, table, id, orgId, by, label }) {
  const [row] = await rows(db, `SELECT * FROM \`${table}\` WHERE id = ?`, [id]);
  if (!row) return null;
  return toTrash(db, { kind, orgId, by, label: label(row), payload: { table, row } });
}

export const levelOf = (deletedAt, now = Date.now()) => {
  const age = (now - new Date(deletedAt).getTime()) / DAY;
  return age >= TOTAL_DAYS ? 3 : age >= LEVEL1_DAYS ? 2 : 1;
};

const RESTORE = {
  async class(db, p) { return restoreGroup(db, p); },
  async group(db, p) { return restoreGroup(db, p); },
  async member(db, p, item) {
    const [u] = await db.query("SELECT id FROM users WHERE id = ? AND status = 'active'", [p.userId]);
    if (!u[0]) throw new HttpError(409, 'gone', 'Ce compte n’existe plus ou est désactivé.');
    await db.query('INSERT IGNORE INTO org_members (organization_id, user_id, role) VALUES (?,?,?)', [item.organization_id, p.userId, p.role]);
    for (const gid of p.classIds ?? []) {
      const [g] = await db.query('SELECT id FROM study_groups WHERE id = ? AND organization_id = ?', [gid, item.organization_id]);
      if (g[0]) await db.query('INSERT IGNORE INTO group_teachers (group_id, user_id) VALUES (?,?)', [gid, p.userId]);
    }
  },
  async invitation(db, p) {
    // L'invitation redevient valable (pas expirée, pas utilisée).
    const [r] = await db.query(
      'UPDATE invitations SET revoked_at = NULL, expires_at = GREATEST(expires_at, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY)) WHERE id = ? AND accepted_at IS NULL', [p.id]);
    if (!r.affectedRows) throw new HttpError(409, 'gone', 'Cette invitation a déjà été utilisée.');
  },
  async assessment(db, p) { return restoreRow(db, p); },
  async reward(db, p) { return restoreRow(db, p); },
};

async function restoreRow(db, { table, row }) {
  const [prof] = await db.query('SELECT id FROM student_profiles WHERE id = ?', [row.profile_id]);
  if (!prof[0]) throw new HttpError(409, 'gone', 'La fiche de l’élève n’existe plus.');
  if (!(await insertRow(db, table, row))) throw new HttpError(409, 'exists', 'Cet élément existe déjà.');
}

async function restoreGroup(db, { group, teachers, students, members }) {
  const [clash] = await db.query('SELECT id FROM study_groups WHERE id = ?', [group.id]);
  if (clash[0]) throw new HttpError(409, 'exists', 'Cet élément existe déjà.');
  const [org] = group.organization_id ? await db.query('SELECT id FROM organizations WHERE id = ?', [group.organization_id]) : [[true]];
  if (!org[0]) throw new HttpError(409, 'gone', 'L’établissement n’existe plus.');
  const [taken] = group.join_code ? await db.query('SELECT id FROM study_groups WHERE join_code = ?', [group.join_code]) : [[]];
  await insertRow(db, 'study_groups', { ...group, join_code: taken[0] ? null : group.join_code });
  if (taken[0] || !group.join_code) await assignGroupCode(db, group.id);
  for (const t of teachers ?? []) await db.query('INSERT IGNORE INTO group_teachers (group_id, user_id) SELECT ?, id FROM users WHERE id = ?', [group.id, t.user_id]);
  for (const s of students ?? []) await db.query('INSERT IGNORE INTO group_students (group_id, profile_id) SELECT ?, id FROM student_profiles WHERE id = ?', [group.id, s.profile_id]);
  for (const m of members ?? []) await db.query('INSERT IGNORE INTO group_members (group_id, user_id, role) SELECT ?, id, ? FROM users WHERE id = ?', [group.id, m.role, m.user_id]);
}

/** Restaure un élément de la corbeille, puis le retire de la corbeille. */
export async function restoreItem(db, item) {
  const fn = RESTORE[item.kind];
  if (!fn) throw new HttpError(400, 'unsupported', 'Type d’élément inconnu.');
  await fn(db, JSON.parse(item.payload), item);
  await db.query('DELETE FROM trash WHERE id = ?', [item.id]);
}

/** Supprime définitivement ce qui a plus de 60 jours. */
export async function purgeTrash(db) {
  const [r] = await db.query('DELETE FROM trash WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)', [TOTAL_DAYS]);
  return r.affectedRows;
}

/** Purge une fois par jour (premier passage 1 min après le démarrage). */
export function startTrashScheduler(app) {
  const run = () => purgeTrash(app.db).then((n) => n && app.log.info({ purged: n }, 'corbeille : éléments supprimés définitivement'), (e) => app.log.warn({ err: e.message }, 'purge de la corbeille impossible'));
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY).unref();
}

export const dto = (r, now = Date.now()) => {
  const level = levelOf(r.deleted_at, now);
  const left = Math.max(0, Math.ceil((new Date(r.deleted_at).getTime() + (level === 1 ? LEVEL1_DAYS : TOTAL_DAYS) * DAY - now) / DAY));
  return {
    id: r.id, kind: r.kind, kindLabel: KINDS[r.kind] ?? r.kind, label: r.label, orgId: r.organization_id, orgName: r.org_name ?? null,
    deletedAt: new Date(r.deleted_at).toISOString(), deletedBy: r.deleted_by_name ?? null, level, daysLeft: left,
  };
};
