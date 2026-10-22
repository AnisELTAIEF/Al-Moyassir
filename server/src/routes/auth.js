import { HttpError } from '../errors.js';
import { tx } from '../db.js';
import { sha256, uuid, newRefreshToken, hashPassword, checkPassword, normalizeCode } from '../security.js';
import { groupByCode, looksLikeGroupCode } from '../groupCodes.js';
import { issueSession, findUserByEmail, validInvitationByCode, validInvitationByEmail, createAccount, iso } from '../users.js';

const strictLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export default async function authRoutes(app) {
  /** Connexion / inscription avec Google (ID token obtenu par l'app ou le site). */
  app.post('/google', {
    config: strictLimit,
    schema: { body: { type: 'object', required: ['idToken'], properties: {
      idToken: { type: 'string', minLength: 20, maxLength: 4096 },
      invitationCode: { type: 'string', maxLength: 20 },
      groupCode: { type: 'string', maxLength: 20 },
    } } },
  }, async (req) => {
    let g;
    try {
      g = await app.verifyGoogle(req.body.idToken);
    } catch (e) {
      if (e.statusCode === 503) throw new HttpError(503, 'google_not_configured', 'Connexion Google non configurée sur le serveur.');
      throw new HttpError(401, 'invalid_google_token', 'Connexion Google refusée.');
    }
    const user = await tx(app.db, async (conn) => {
      const [bySub] = await conn.query('SELECT * FROM users WHERE google_sub = ? FOR UPDATE', [g.sub]);
      let u = bySub[0] ?? (await findUserByEmail(conn, g.email));
      if (u) {
        if (!u.google_sub) await conn.query('UPDATE users SET google_sub = ? WHERE id = ?', [g.sub, u.id]);
        return u;
      }
      const { invitation, group } = await resolveCodes(conn, req.body);
      if (invitation?.email && invitation.email !== g.email) throw emailMismatch(invitation.email);
      return createAccount(conn, app.cfg, {
        email: g.email, displayName: g.name, googleSub: g.sub,
        invitation: invitation ?? (group ? null : await validInvitationByEmail(conn, g.email)), group,
      });
    });
    if (user.status !== 'active') throw new HttpError(403, 'account_disabled', 'Compte désactivé.');
    return issueSession(app, user);
  });

  /** Inscription par e-mail + mot de passe, avec un code d'invitation (ou pour l'admin par défaut). */
  app.post('/register', {
    config: strictLimit,
    schema: { body: { type: 'object', required: ['password', 'displayName'], properties: {
      // Facultatif avec un code d'invitation : l'e-mail de l'invitation est alors utilisé.
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
      displayName: { type: 'string', minLength: 2, maxLength: 80 },
      invitationCode: { type: 'string', maxLength: 20 },
      groupCode: { type: 'string', maxLength: 20 },
    } } },
  }, async (req) => {
    const passwordHash = await hashPassword(req.body.password);
    const user = await tx(app.db, async (conn) => {
      const { invitation, group } = await resolveCodes(conn, req.body);
      const given = req.body.email?.trim().toLowerCase();
      if (invitation?.email && given && given !== invitation.email) throw emailMismatch(invitation.email);
      const email = invitation?.email ?? given; // invitation sans e-mail : celui de la personne
      if (!email) throw new HttpError(400, 'email_required', 'Indiquez votre adresse e-mail.');
      if (await findUserByEmail(conn, email)) {
        throw new HttpError(409, 'email_taken', 'Un compte existe déjà avec cet e-mail. Connectez-vous.');
      }
      return createAccount(conn, app.cfg, { email, displayName: req.body.displayName.trim(), passwordHash, invitation, group });
    });
    return issueSession(app, user);
  });

  app.post('/login', {
    config: strictLimit,
    schema: { body: { type: 'object', required: ['email', 'password'], properties: {
      email: { type: 'string', maxLength: 254 }, password: { type: 'string', maxLength: 200 },
    } } },
  }, async (req) => {
    const u = await findUserByEmail(app.db, req.body.email.trim());
    const ok = await checkPassword(req.body.password, u?.password_hash);
    if (!u || !ok) throw new HttpError(401, 'invalid_credentials', 'E-mail ou mot de passe incorrect.');
    if (u.status !== 'active') throw new HttpError(403, 'account_disabled', 'Compte désactivé.');
    return issueSession(app, u);
  });

  /** Réinitialisation du mot de passe avec un code fourni par l'admin ; connecte la personne. */
  app.post('/reset-password', {
    config: strictLimit,
    schema: { body: { type: 'object', required: ['code', 'password'], properties: {
      code: { type: 'string', maxLength: 20 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    } } },
  }, async (req) => {
    const hash = sha256(normalizeCode(req.body.code));
    const passwordHash = await hashPassword(req.body.password);
    const user = await tx(app.db, async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM users WHERE reset_code_hash = ? AND reset_expires_at > UTC_TIMESTAMP(3) FOR UPDATE', [hash]);
      const u = rows[0];
      if (!u) throw new HttpError(400, 'invalid_reset', 'Code de réinitialisation invalide ou expiré.');
      if (u.status !== 'active') throw new HttpError(403, 'account_disabled', 'Compte désactivé.');
      await conn.query('UPDATE users SET password_hash = ?, reset_code_hash = NULL, reset_expires_at = NULL WHERE id = ?',
        [passwordHash, u.id]);
      await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [u.id]);
      return u;
    });
    return issueSession(app, user);
  });

  /** Échange un refresh token contre une nouvelle session (rotation ; réutilisation = révocation totale). */
  app.post('/refresh', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string', maxLength: 200 } } } },
  }, async (req) => {
    const hash = sha256(req.body.refreshToken);
    const result = await tx(app.db, async (conn) => {
      const [rows] = await conn.query('SELECT * FROM refresh_tokens WHERE token_hash = ? FOR UPDATE', [hash]);
      const t = rows[0];
      if (!t) throw new HttpError(401, 'invalid_refresh', 'Session expirée, reconnectez-vous.');
      if (t.revoked_at) {
        await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [t.user_id]);
        return { reused: true };
      }
      if (new Date(t.expires_at) < new Date()) throw new HttpError(401, 'invalid_refresh', 'Session expirée, reconnectez-vous.');
      const [users] = await conn.query('SELECT * FROM users WHERE id = ?', [t.user_id]);
      const u = users[0];
      if (!u || u.status !== 'active') throw new HttpError(401, 'account_disabled', 'Compte désactivé.');
      await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ?', [t.id]);
      const next = newRefreshToken();
      await conn.query('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        [uuid(), u.id, sha256(next), new Date(Date.now() + app.cfg.refreshTtlDays * 86_400_000)]);
      return { user: u, refresh: next };
    });
    // Hors transaction : la révocation d'un jeton réutilisé doit être conservée.
    if (result.reused) throw new HttpError(401, 'refresh_reused', 'Session invalidée par sécurité, reconnectez-vous.');
    return {
      accessToken: await app.tokens.sign(result.user),
      refreshToken: result.refresh,
      expiresIn: app.cfg.accessTtlSeconds,
    };
  });

  app.post('/logout', {
    schema: { body: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string', maxLength: 200 } } } },
  }, async (req) => {
    await app.db.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE token_hash = ? AND revoked_at IS NULL',
      [sha256(req.body.refreshToken)]);
    return { ok: true };
  });

  /**
   * Aperçu public d'un code saisi dans l'app : invitation (8 caractères → e-mail et groupe pré-remplis)
   * ou code de groupe (6 caractères → nom du groupe).
   */
  app.get('/codes/:code', { config: strictLimit }, async (req) => {
    const code = req.params.code;
    if (looksLikeGroupCode(code)) {
      const g = await groupByCode(app.db, code);
      if (!g) throw new HttpError(404, 'invalid_code', 'Code invalide. Vérifiez-le auprès de l’admin du groupe.');
      return { type: 'group', groupName: g.name };
    }
    const inv = await validInvitationByCode(app.db, normalizeCode(code));
    if (!inv) throw new HttpError(404, 'invalid_code', 'Code invalide ou expiré. Vérifiez-le auprès de l’admin du groupe.');
    const [gr] = inv.group_id ? await app.db.query('SELECT name FROM study_groups WHERE id = ?', [inv.group_id]) : [[]];
    const [by] = inv.invited_by ? await app.db.query('SELECT display_name FROM users WHERE id = ?', [inv.invited_by]) : [[]];
    const org = await orgInfo(app.db, inv);
    return { type: 'invitation', email: inv.email, displayName: inv.display_name ?? null, role: inv.role, groupName: gr[0]?.name ?? null, ...org, invitedBy: by[0]?.display_name ?? null, expiresAt: iso(inv.expires_at) };
  });

  /** Aperçu public d'une invitation (pour l'écran « J'ai un code »). */
  app.get('/invitations/:code', { config: strictLimit }, async (req) => {
    const inv = await validInvitationByCode(app.db, normalizeCode(req.params.code));
    if (!inv) throw new HttpError(404, 'invalid_invitation', 'Code d’invitation invalide ou expiré.');
    const [g] = inv.group_id ? await app.db.query('SELECT name FROM study_groups WHERE id = ?', [inv.group_id]) : [[]];
    const [by] = inv.invited_by ? await app.db.query('SELECT display_name FROM users WHERE id = ?', [inv.invited_by]) : [[]];
    const org = await orgInfo(app.db, inv);
    return { email: inv.email, displayName: inv.display_name ?? null, role: inv.role, groupName: g[0]?.name ?? null, ...org, invitedBy: by[0]?.display_name ?? null, expiresAt: iso(inv.expires_at) };
  });
}

/** Établissement, rôle et classe d'une invitation d'établissement (vide pour les autres). */
async function orgInfo(db, inv) {
  if (!inv.org_id) return {};
  const [[o]] = await db.query('SELECT name FROM organizations WHERE id = ?', [inv.org_id]);
  const [c] = inv.class_id ? await db.query('SELECT name FROM study_groups WHERE id = ?', [inv.class_id]) : [[]];
  return { orgName: o?.name ?? null, orgRole: inv.org_role, className: c[0]?.name ?? null };
}

const emailMismatch = (email) => new HttpError(400, 'email_mismatch', `Ce code d’invitation est réservé à ${email}.`);

/** Code d'invitation et/ou code de groupe envoyés par l'app (un code de 6 caractères dans invitationCode est accepté comme code de groupe). */
async function resolveCodes(conn, body) {
  let invitation = null, group = null;
  const invCode = body.invitationCode?.trim();
  const grpCode = body.groupCode?.trim() || (invCode && looksLikeGroupCode(invCode) ? invCode : null);
  if (invCode && !looksLikeGroupCode(invCode)) {
    invitation = await validInvitationByCode(conn, normalizeCode(invCode));
    if (!invitation) throw new HttpError(400, 'invalid_invitation', 'Code d’invitation invalide ou expiré.');
  }
  if (grpCode) {
    group = await groupByCode(conn, grpCode);
    if (!group) throw new HttpError(400, 'invalid_group_code', 'Code de groupe invalide.');
  }
  return { invitation, group };
}
