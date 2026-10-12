import { HttpError } from '../errors.js';
import { tx } from '../db.js';
import { sha256, uuid, newRefreshToken, hashPassword, checkPassword, normalizeCode } from '../security.js';
import { issueSession, findUserByEmail, validInvitationByCode, validInvitationByEmail, createAccount, iso } from '../users.js';

const strictLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export default async function authRoutes(app) {
  /** Connexion / inscription avec Google (ID token obtenu par l'app ou le site). */
  app.post('/google', {
    config: strictLimit,
    schema: { body: { type: 'object', required: ['idToken'], properties: {
      idToken: { type: 'string', minLength: 20, maxLength: 4096 },
      invitationCode: { type: 'string', maxLength: 20 },
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
      const invitation = req.body.invitationCode
        ? await validInvitationByCode(conn, normalizeCode(req.body.invitationCode))
        : await validInvitationByEmail(conn, g.email);
      if (req.body.invitationCode && !invitation) {
        throw new HttpError(400, 'invalid_invitation', 'Code d’invitation invalide ou expiré.');
      }
      return createAccount(conn, app.cfg, { email: g.email, displayName: g.name, googleSub: g.sub, invitation });
    });
    if (user.status !== 'active') throw new HttpError(403, 'account_disabled', 'Compte désactivé.');
    return issueSession(app, user);
  });

  /** Inscription par e-mail + mot de passe, avec un code d'invitation (ou pour l'admin par défaut). */
  app.post('/register', {
    config: strictLimit,
    schema: { body: { type: 'object', required: ['email', 'password', 'displayName'], properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
      displayName: { type: 'string', minLength: 2, maxLength: 80 },
      invitationCode: { type: 'string', maxLength: 20 },
    } } },
  }, async (req) => {
    const email = req.body.email.trim().toLowerCase();
    const passwordHash = await hashPassword(req.body.password);
    const user = await tx(app.db, async (conn) => {
      if (await findUserByEmail(conn, email)) {
        throw new HttpError(409, 'email_taken', 'Un compte existe déjà avec cet e-mail. Connectez-vous.');
      }
      let invitation = null;
      if (req.body.invitationCode) {
        invitation = await validInvitationByCode(conn, normalizeCode(req.body.invitationCode));
        if (!invitation) throw new HttpError(400, 'invalid_invitation', 'Code d’invitation invalide ou expiré.');
      }
      return createAccount(conn, app.cfg, { email, displayName: req.body.displayName.trim(), passwordHash, invitation });
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

  /** Aperçu public d'une invitation (pour l'écran « J'ai un code »). */
  app.get('/invitations/:code', { config: strictLimit }, async (req) => {
    const inv = await validInvitationByCode(app.db, normalizeCode(req.params.code));
    if (!inv) throw new HttpError(404, 'invalid_invitation', 'Code d’invitation invalide ou expiré.');
    const [g] = inv.group_id ? await app.db.query('SELECT name FROM study_groups WHERE id = ?', [inv.group_id]) : [[]];
    const [by] = inv.invited_by ? await app.db.query('SELECT display_name FROM users WHERE id = ?', [inv.invited_by]) : [[]];
    return { email: inv.email, role: inv.role, groupName: g[0]?.name ?? null, invitedBy: by[0]?.display_name ?? null, expiresAt: iso(inv.expires_at) };
  });
}
