// Autorisation partagée par les routes d'établissement (fiches élèves, validations…).
// Règle : le rôle est TOUJOURS vérifié dans l'établissement de la route, jamais le rôle global seul.
import { HttpError } from './errors.js';

export const STUDENT_COLS = `p.id, p.organization_id, p.user_id, p.full_name, p.father_name,
  DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birth_date, p.gender, p.phone, p.phone_verified_at,
  DATE_FORMAT(p.joined_at, '%Y-%m-%d') AS joined_at, DATE_FORMAT(p.hifdh_started_at, '%Y-%m-%d') AS hifdh_started_at,
  p.past_competitions, p.guardian_consent_at, p.status, p.elite_tag,
  DATE_FORMAT(p.left_at, '%Y-%m-%d') AS left_at, DATE_FORMAT(p.retain_until, '%Y-%m-%d') AS retain_until, p.created_at`;


export function orgAccessFor(app) {
  const db = app.db;

  /** Charge l'établissement et les rôles de l'utilisateur dedans. 404 si inconnu OU si l'utilisateur n'y est pour rien. */
  async function access(req, orgId, allowed = ['admin']) {
    const [[org]] = await db.query('SELECT * FROM organizations WHERE id = ?', [orgId]);
    const isGlobal = req.user.role === 'admin';
    const [rows] = org ? await db.query('SELECT role FROM org_members WHERE organization_id = ? AND user_id = ?', [orgId, req.user.id]) : [[]];
    const roles = new Set(rows.map((r) => r.role));
    if (!org || (!isGlobal && roles.size === 0)) throw new HttpError(404, 'not_found', 'Établissement introuvable.');
    if (!isGlobal && !allowed.some((r) => roles.has(r))) throw new HttpError(403, 'forbidden', 'Action réservée à l’équipe de cet établissement.');
    // Un enseignant ne voit que les élèves de ses classes ; l'admin (local ou global) voit tout.
    const seesAll = isGlobal || roles.has('admin');
    return { org, roles, isGlobal, seesAll };
  }

  /** Fiche élève, avec le contrôle de portée (enseignant : seulement ses classes). */
  async function studentOf(req, ctx, pid) {
    const [[row]] = await db.query(`SELECT ${STUDENT_COLS} FROM student_profiles p WHERE p.id = ? AND p.organization_id = ?`, [pid, ctx.org.id]);
    if (!row) throw new HttpError(404, 'not_found', 'Élève introuvable.');
    if (!ctx.seesAll) {
      const [ok] = await db.query(
        `SELECT 1 FROM group_students gs JOIN group_teachers gt ON gt.group_id = gs.group_id
         WHERE gs.profile_id = ? AND gt.user_id = ?`, [pid, req.user.id]);
      if (!ok.length) throw new HttpError(404, 'not_found', 'Élève introuvable.');
    }
    return row;
  }

  return { access, studentOf };
}
