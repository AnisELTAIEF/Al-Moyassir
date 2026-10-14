// Administration : utilisateurs, rôles, invitations, groupes. Réservé au rôle « admin ».
import { assignGroupCode } from '../groupCodes.js';
import { HttpError } from '../errors.js';
import { tx } from '../db.js';
import { uuid, sha256, normalizeCode, newInvitationCode } from '../security.js';
import { createInvitation, invitationRow } from '../invitations.js';
import { iso, otherActiveAdmins } from '../users.js';
import { progressOf, STATS_SQL, statsRow } from '../progress.js';

const idParam = { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } };

export default async function adminRoutes(app) {
  app.addHook('preHandler', app.requireAdmin);

  // ── Tableau de bord ──
  app.get('/stats', async () => {
    const [[u]] = await app.db.query(
      "SELECT COUNT(*) AS users, SUM(role = 'admin') AS admins, SUM(status = 'active') AS active FROM users");
    const [[m]] = await app.db.query(
      "SELECT COALESCE(SUM(status = 'memorized'), 0) AS memorized, COUNT(DISTINCT user_id) AS learners FROM memorized_ayahs");
    const [[a]] = await app.db.query(
      'SELECT COUNT(DISTINCT user_id) AS active7 FROM memorized_ayahs WHERE updated_at > UTC_TIMESTAMP(3) - INTERVAL 7 DAY');
    const [[i]] = await app.db.query(
      'SELECT COUNT(*) AS pending FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)');
    const [[g]] = await app.db.query('SELECT COUNT(*) AS groups_count FROM study_groups');
    return {
      users: Number(u.users), admins: Number(u.admins ?? 0), activeUsers: Number(u.active ?? 0),
      memorizedTotal: Number(m.memorized), learners: Number(m.learners), active7Days: Number(a.active7),
      pendingInvitations: Number(i.pending), groups: Number(g.groups_count),
    };
  });

  /** Ayat appris par jour sur les N derniers jours (tendance du tableau de bord). */
  app.get('/activity', {
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 } } } },
  }, async (req) => {
    const days = req.query.days ?? 30;
    const [rows] = await app.db.query(
      `SELECT DATE(memorized_at) AS d, COUNT(*) AS c FROM memorized_ayahs
       WHERE status = 'memorized' AND memorized_at IS NOT NULL
         AND memorized_at >= UTC_TIMESTAMP(3) - INTERVAL ? DAY
       GROUP BY DATE(memorized_at) ORDER BY d`, [days]);
    return {
      items: rows.map((r) => ({
        day: r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10),
        memorized: Number(r.c),
      })),
    };
  });

  // ── Utilisateurs ──
  app.get('/users', async () => {
    const [rows] = await app.db.query(`${STATS_SQL} GROUP BY u.id ORDER BY u.display_name`);
    return { items: rows.map(statsRow) };
  });

  app.get('/users/:id/progress', { schema: { params: idParam } }, async (req) => ({
    items: await progressOf(app.db, req.params.id),
  }));

  /**
   * Génère un code de réinitialisation du mot de passe (valable 7 jours). Le code n'est renvoyé
   * qu'ici (seule son empreinte est stockée) : l'admin le transmet à la personne, qui le saisit
   * dans l'app (« Mot de passe oublié ») pour choisir un nouveau mot de passe.
   */
  app.post('/users/:id/reset-password', { schema: { params: idParam } }, async (req) => {
    const [rows] = await app.db.query('SELECT id, email FROM users WHERE id = ?', [req.params.id]);
    const u = rows[0];
    if (!u) throw new HttpError(404, 'not_found', 'Utilisateur introuvable.');
    const code = newInvitationCode();
    const expires = new Date(Date.now() + 7 * 86_400_000);
    await app.db.query('UPDATE users SET reset_code_hash = ?, reset_expires_at = ? WHERE id = ?',
      [sha256(normalizeCode(code)), expires, u.id]);
    return {
      code,
      expiresAt: iso(expires),
      message: `Réinitialisation de votre mot de passe Almoyassir (الميسّر). Dans l'app : « Mot de passe oublié », puis saisissez ce code : ${code}`,
    };
  });

  /** Groupes auxquels appartient un utilisateur (avec son rôle dans chacun). */
  app.get('/users/:id/groups', { schema: { params: idParam } }, async (req) => {
    const [rows] = await app.db.query(
      `SELECT g.id, g.name, gm.role FROM group_members gm
       JOIN study_groups g ON g.id = gm.group_id
       WHERE gm.user_id = ? ORDER BY g.name`, [req.params.id]);
    return { items: rows.map((r) => ({ id: r.id, name: r.name, role: r.role })) };
  });

  app.patch('/users/:id', {
    schema: { params: idParam, body: { type: 'object', minProperties: 1, properties: {
      role: { type: 'string', enum: ['user', 'admin'] },
      status: { type: 'string', enum: ['active', 'disabled'] },
      displayName: { type: 'string', minLength: 2, maxLength: 80 },
    } } },
  }, async (req) => {
    const id = req.params.id;
    return tx(app.db, async (conn) => {
      const [rows] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [id]);
      const u = rows[0];
      if (!u) throw new HttpError(404, 'not_found', 'Utilisateur introuvable.');
      const losesAdmin = u.role === 'admin' && u.status === 'active' &&
        (req.body.role === 'user' || req.body.status === 'disabled');
      if (losesAdmin && (await otherActiveAdmins(conn, id)) === 0) {
        throw new HttpError(409, 'last_admin', 'Impossible : c’est le dernier administrateur actif.');
      }
      const role = req.body.role ?? u.role;
      const status = req.body.status ?? u.status;
      const name = req.body.displayName?.trim() ?? u.display_name;
      await conn.query('UPDATE users SET role = ?, status = ?, display_name = ? WHERE id = ?', [role, status, name, id]);
      if (status === 'disabled') {
        await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [id]);
      }
      return { id, email: u.email, displayName: name, role, status };
    });
  });

  app.delete('/users/:id', { schema: { params: idParam } }, async (req) => {
    const id = req.params.id;
    if (id === req.user.id) throw new HttpError(409, 'self_delete', 'Vous ne pouvez pas supprimer votre propre compte ici.');
    return tx(app.db, async (conn) => {
      const [rows] = await conn.query('SELECT role, status FROM users WHERE id = ? FOR UPDATE', [id]);
      if (!rows[0]) throw new HttpError(404, 'not_found', 'Utilisateur introuvable.');
      if (rows[0].role === 'admin' && (await otherActiveAdmins(conn, id)) === 0) {
        throw new HttpError(409, 'last_admin', 'Impossible : c’est le dernier administrateur actif.');
      }
      await conn.query('DELETE FROM users WHERE id = ?', [id]);
      return { ok: true };
    });
  });

  // ── Invitations ──

  app.get('/invitations', async () => {
    const [rows] = await app.db.query(
      `SELECT i.*, g.name AS group_name, u.display_name AS inviter_name FROM invitations i
       LEFT JOIN study_groups g ON g.id = i.group_id LEFT JOIN users u ON u.id = i.invited_by
       ORDER BY i.created_at DESC LIMIT 500`);
    return { items: rows.map(invitationRow) };
  });

  /** Crée une invitation. Le code n'est renvoyé qu'une fois (seule son empreinte est stockée). */
  app.post('/invitations', {
    schema: { body: { type: 'object', required: ['email'], properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      role: { type: 'string', enum: ['user', 'admin'] },
      groupId: { type: ['string', 'null'], maxLength: 36 },
      groupRole: { type: 'string', enum: ['admin', 'member'] },
    } } },
  }, async (req) => createInvitation(app, {
    email: req.body.email, role: req.body.role ?? 'user', groupId: req.body.groupId ?? null,
    groupRole: req.body.groupRole ?? 'member', invitedBy: req.user.id,
  }));

  app.delete('/invitations/:id', { schema: { params: idParam } }, async (req) => {
    const [res] = await app.db.query(
      'UPDATE invitations SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL', [req.params.id]);
    if (!res.affectedRows) throw new HttpError(404, 'not_found', 'Invitation introuvable ou déjà utilisée.');
    return { ok: true };
  });

  // ── Groupes ──
  app.get('/groups', async () => {
    const [rows] = await app.db.query(
      `SELECT g.id, g.name, g.join_code, g.join_open, g.created_at, COUNT(gm.user_id) AS members,
              SUM(gm.role = 'admin') AS managers
       FROM study_groups g LEFT JOIN group_members gm ON gm.group_id = g.id
       GROUP BY g.id ORDER BY g.name`);
    return { items: rows.map((r) => ({ id: r.id, name: r.name, joinCode: r.join_code, joinOpen: !!r.join_open, createdAt: iso(r.created_at), members: Number(r.members), managers: Number(r.managers ?? 0) })) };
  });

  const nameBody = { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2, maxLength: 80 } } };

  app.post('/groups', { schema: { body: nameBody } }, async (req) => {
    const id = uuid();
    await app.db.query('INSERT INTO study_groups (id, name, created_by) VALUES (?, ?, ?)', [id, req.body.name.trim(), req.user.id]);
    return { id, name: req.body.name.trim(), joinCode: await assignGroupCode(app.db, id) };
  });

  app.patch('/groups/:id', { schema: { params: idParam, body: nameBody } }, async (req) => {
    const [res] = await app.db.query('UPDATE study_groups SET name = ? WHERE id = ?', [req.body.name.trim(), req.params.id]);
    if (!res.affectedRows) throw new HttpError(404, 'not_found', 'Groupe introuvable.');
    return { id: req.params.id, name: req.body.name.trim() };
  });

  app.delete('/groups/:id', { schema: { params: idParam } }, async (req) => {
    await app.db.query('DELETE FROM study_groups WHERE id = ?', [req.params.id]);
    return { ok: true };
  });

  app.put('/groups/:id/members/:uid', {
    schema: { body: { type: 'object', properties: { role: { type: 'string', enum: ['admin', 'member'] } } } },
  }, async (req) => {
    const role = req.body?.role ?? 'member';
    const [[g]] = await app.db.query('SELECT COUNT(*) AS c FROM study_groups WHERE id = ?', [req.params.id]);
    const [[u]] = await app.db.query('SELECT COUNT(*) AS c FROM users WHERE id = ?', [req.params.uid]);
    if (!Number(g.c) || !Number(u.c)) throw new HttpError(404, 'not_found', 'Groupe ou utilisateur introuvable.');
    await app.db.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
      [req.params.id, req.params.uid, role]);
    return { ok: true };
  });

  app.delete('/groups/:id/members/:uid', async (req) => {
    await app.db.query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.params.uid]);
    return { ok: true };
  });
}
