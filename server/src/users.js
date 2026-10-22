// Fonctions partagées : sérialisation, sessions, création de compte (inscription ouverte).
import { uuid, sha256, newRefreshToken } from './security.js';

export const iso = (d) => (d ? new Date(d).toISOString() : null);

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  role: u.role,
  status: u.status,
});

export async function issueSession(app, user) {
  const refresh = newRefreshToken();
  const expires = new Date(Date.now() + app.cfg.refreshTtlDays * 86_400_000);
  await app.db.query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [uuid(), user.id, sha256(refresh), expires]);
  await app.db.query('UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [user.id]);
  return {
    accessToken: await app.tokens.sign(user),
    refreshToken: refresh,
    expiresIn: app.cfg.accessTtlSeconds,
    user: publicUser(user),
  };
}

export async function findUserByEmail(db, email) {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  return rows[0] ?? null;
}

/** Invitation valide pour ce code (non expirée, non révoquée, non utilisée), ou null. */
export async function validInvitationByCode(db, code) {
  const [rows] = await db.query(
    `SELECT * FROM invitations WHERE code_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL
       AND expires_at > UTC_TIMESTAMP(3)`, [sha256(code)]);
  return rows[0] ?? null;
}

export async function validInvitationByEmail(db, email) {
  const [rows] = await db.query(
    `SELECT * FROM invitations WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL
       AND expires_at > UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 1`, [email.toLowerCase()]);
  return rows[0] ?? null;
}

/** Invitation d'établissement : la personne devient enseignant (ou administratif) et rejoint la classe indiquée. */
export async function applyOrgInvitation(conn, invitation, userId) {
  if (!invitation.org_id || !invitation.org_role) return;
  await conn.query('INSERT IGNORE INTO org_members (organization_id, user_id, role) VALUES (?, ?, ?)', [invitation.org_id, userId, invitation.org_role]);
  if (invitation.class_id && invitation.org_role === 'teacher') {
    await conn.query('INSERT IGNORE INTO group_teachers (group_id, user_id) VALUES (?, ?)', [invitation.class_id, userId]);
  }
}

/**
 * Crée un compte. L'inscription est ouverte : toute personne peut créer un compte (rôle « user »),
 * ce qui permet de conserver sa progression d'un appareil à l'autre. Le rôle vient de l'invitation
 * si elle existe, ou « admin » pour l'administrateur par défaut.
 */
export async function createAccount(conn, cfg, { email, displayName, passwordHash = null, googleSub = null, invitation = null, group = null }) {
  email = email.toLowerCase();
  const isBootstrap = email === cfg.bootstrapAdminEmail;
  const id = uuid();
  const role = isBootstrap ? 'admin' : invitation ? invitation.role : 'user';
  await conn.query(
    `INSERT INTO users (id, email, display_name, password_hash, google_sub, role) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, email, (displayName || email.split('@')[0]).slice(0, 80), passwordHash, googleSub, role]);
  if (invitation) {
    await conn.query('UPDATE invitations SET accepted_at = UTC_TIMESTAMP(3), accepted_by = ? WHERE id = ?', [id, invitation.id]);
    if (invitation.group_id) {
      await conn.query('INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        [invitation.group_id, id, invitation.group_role ?? 'member']);
    }
    await applyOrgInvitation(conn, invitation, id);
  }
  // Autres invitations en cours pour la même adresse (ex. import dans plusieurs groupes) :
  // la personne rejoint aussi ces groupes. Seulement si l'adresse est prouvée (code d'invitation
  // reçu à cette adresse, ou compte Google), jamais sur une simple inscription sans code.
  const [others] = !invitation || !invitation.email ? [[]] : await conn.query(
    `SELECT id, group_id, group_role FROM invitations WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL
       AND expires_at > UTC_TIMESTAMP(3) AND group_id IS NOT NULL`, [email]);
  for (const o of others) {
    await conn.query('INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [o.group_id, id, o.group_role ?? 'member']);
    await conn.query('UPDATE invitations SET accepted_at = UTC_TIMESTAMP(3), accepted_by = ? WHERE id = ?', [id, o.id]);
  }
  if (group) {
    // Code de groupe : membre simple du groupe.
    await conn.query("INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')", [group.id, id]);
  }
  const [rows] = await conn.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
}

/** Nombre d'admins actifs, hors `exceptId`. */
export async function otherActiveAdmins(db, exceptId) {
  const [rows] = await db.query(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [exceptId]);
  return Number(rows[0].c);
}
