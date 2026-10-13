// Gestion et suivi d'un groupe : admins globaux et admins du groupe.
import { HttpError } from '../errors.js';
import { tx } from '../db.js';
import { progressOf, statsRow } from '../progress.js';
import { createInvitation, invitationRow } from '../invitations.js';
import { assignGroupCode } from '../groupCodes.js';

const idParam = { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } };

/** Admin global, ou admin de ce groupe. */
export async function canManageGroup(app, user, groupId) {
  if (user.role === 'admin') return true;
  const [rows] = await app.db.query(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'", [groupId, user.id]);
  return rows.length > 0;
}

async function groupAdmins(db, groupId) {
  const [[r]] = await db.query("SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND role = 'admin'", [groupId]);
  return Number(r.c);
}

export default async function groupRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  const guard = async (req) => {
    const [g] = await app.db.query('SELECT id, name, join_code, join_open FROM study_groups WHERE id = ?', [req.params.id]);
    if (!g[0]) throw new HttpError(404, 'not_found', 'Groupe introuvable.');
    if (!(await canManageGroup(app, req.user, req.params.id))) throw new HttpError(403, 'forbidden', 'Réservé aux admins de ce groupe.');
    return g[0];
  };

  app.get('/:id/overview', { schema: { params: idParam } }, async (req) => {
    const g = await guard(req);
    const [rows] = await app.db.query(
      `SELECT gm.role AS group_role, gm.joined_at, u.id, u.email, u.display_name, u.role, u.status,
              u.created_at, u.last_login_at,
              COALESCE(SUM(m.status = 'memorized'), 0) AS memorized,
              COALESCE(SUM(m.status = 'learning'), 0)  AS learning,
              MAX(m.updated_at) AS last_activity
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN memorized_ayahs m ON m.user_id = u.id
       WHERE gm.group_id = ?
       GROUP BY u.id, gm.role, gm.joined_at
       ORDER BY u.display_name`, [g.id]);
    return {
      group: { id: g.id, name: g.name, joinCode: g.join_code, joinOpen: !!g.join_open },
      members: rows.map((r) => ({ ...statsRow(r), groupRole: r.group_role, joinedAt: r.joined_at?.toISOString() })),
    };
  });

  app.get('/:id/members/:uid/progress', { schema: { params: idParam } }, async (req) => {
    await guard(req);
    const [m] = await app.db.query('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.params.uid]);
    if (!m.length) throw new HttpError(404, 'not_member', 'Cette personne n’est pas membre du groupe.');
    return { items: await progressOf(app.db, req.params.uid) };
  });

  /** Nouveau code de groupe (l'ancien cesse de fonctionner). */
  app.post('/:id/join-code', { schema: { params: idParam } }, async (req) => {
    const g = await guard(req);
    return { joinCode: await assignGroupCode(app.db, g.id) };
  });

  /** Autorise ou non l'adhésion avec le code du groupe (activé par défaut). */
  app.put('/:id/join-open', {
    schema: { params: idParam, body: { type: 'object', required: ['open'], properties: { open: { type: 'boolean' } } } },
  }, async (req) => {
    const g = await guard(req);
    await app.db.query('UPDATE study_groups SET join_open = ? WHERE id = ?', [req.body.open ? 1 : 0, g.id]);
    return { ok: true, joinOpen: req.body.open };
  });

  app.patch('/:id', {
    schema: { params: idParam, body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2, maxLength: 80 } } } },
  }, async (req) => {
    await guard(req);
    await app.db.query('UPDATE study_groups SET name = ? WHERE id = ?', [req.body.name.trim(), req.params.id]);
    return { id: req.params.id, name: req.body.name.trim() };
  });

  /**
   * Ajoute une personne au groupe par e-mail : si elle a un compte, elle est ajoutée tout de suite ;
   * sinon une invitation (code à partager) est créée pour ce groupe.
   */
  app.post('/:id/members', {
    schema: { params: idParam, body: { type: 'object', required: ['email'], properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      role: { type: 'string', enum: ['admin', 'member'] },
    } } },
  }, async (req) => {
    const g = await guard(req);
    const email = req.body.email.trim().toLowerCase();
    const role = req.body.role ?? 'member';
    const [u] = await app.db.query('SELECT id, display_name, status FROM users WHERE email = ?', [email]);
    if (u[0]) {
      if (u[0].status !== 'active') throw new HttpError(409, 'account_disabled', 'Ce compte est désactivé.');
      await app.db.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [g.id, u[0].id, role]);
      return { added: true, user: { id: u[0].id, email, displayName: u[0].display_name }, role };
    }
    const inv = await createInvitation(app, { email, role: 'user', groupId: g.id, groupRole: role, invitedBy: req.user.id });
    return { invited: true, ...inv };
  });

  app.put('/:id/members/:uid', {
    schema: { params: idParam, body: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'member'] } } } },
  }, async (req) => {
    await guard(req);
    return tx(app.db, async (conn) => {
      const [m] = await conn.query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.params.uid]);
      if (!m[0]) throw new HttpError(404, 'not_member', 'Cette personne n’est pas membre du groupe.');
      if (m[0].role === 'admin' && req.body.role === 'member' && req.user.role !== 'admin' && (await groupAdmins(conn, req.params.id)) <= 1) {
        throw new HttpError(409, 'last_group_admin', 'Le groupe doit garder au moins un admin. Nommez-en un autre d’abord.');
      }
      await conn.query('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?', [req.body.role, req.params.id, req.params.uid]);
      return { ok: true };
    });
  });

  /** Retire un membre ; chacun peut aussi quitter un groupe lui-même. */
  app.delete('/:id/members/:uid', { schema: { params: idParam } }, async (req) => {
    const self = req.params.uid === req.user.id;
    if (!self) await guard(req);
    return tx(app.db, async (conn) => {
      const [m] = await conn.query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.params.uid]);
      if (!m[0]) throw new HttpError(404, 'not_member', 'Cette personne n’est pas membre du groupe.');
      if (m[0].role === 'admin' && req.user.role !== 'admin' && (await groupAdmins(conn, req.params.id)) <= 1) {
        throw new HttpError(409, 'last_group_admin', 'Le groupe doit garder au moins un admin. Nommez-en un autre d’abord.');
      }
      await conn.query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.params.uid]);
      return { ok: true };
    });
  });

  app.get('/:id/invitations', { schema: { params: idParam } }, async (req) => {
    await guard(req);
    const [rows] = await app.db.query(
      `SELECT i.*, g.name AS group_name, u.display_name AS inviter_name FROM invitations i
       LEFT JOIN study_groups g ON g.id = i.group_id LEFT JOIN users u ON u.id = i.invited_by
       WHERE i.group_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > UTC_TIMESTAMP(3)
       ORDER BY i.created_at DESC`, [req.params.id]);
    return { items: rows.map(invitationRow) };
  });

  app.delete('/:id/invitations/:inv', { schema: { params: idParam } }, async (req) => {
    await guard(req);
    const [res] = await app.db.query(
      'UPDATE invitations SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND group_id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
      [req.params.inv, req.params.id]);
    if (!res.affectedRows) throw new HttpError(404, 'not_found', 'Invitation introuvable ou déjà utilisée.');
    return { ok: true };
  });
}
