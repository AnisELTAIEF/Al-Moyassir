import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { tokenService, googleVerifier } from './security.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import groupRoutes from './routes/groups.js';
import adminRoutes from './routes/admin.js';
import orgRoutes from './routes/orgs.js';
import inviteRoutes from './routes/invite.js';
import geocodeRoutes from './routes/geocode.js';
import downloadRoutes from './routes/download.js';
import { ensureGroupCodes } from './groupCodes.js';

import { HttpError } from './errors.js';

export { HttpError };

/**
 * Construit l'application. `deps.pool` = pool MariaDB ; `deps.verifyGoogle` peut être
 * remplacé dans les tests.
 */
export async function buildApp(cfg, deps) {
  const app = Fastify({
    logger: deps.logger ?? { level: 'info' },
    trustProxy: cfg.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });

  const tokens = tokenService(cfg.jwtSecret, cfg.accessTtlSeconds);
  const [surahRows] = await deps.pool.query('SELECT n, ayah_count FROM surahs ORDER BY n');
  const ayahCounts = new Map(surahRows.map((r) => [Number(r.n), Number(r.ayah_count)]));
  if (ayahCounts.size !== 114) throw new Error('Table surahs incomplète : lancez « npm run migrate ».');

  await ensureGroupCodes(deps.pool);
  app.decorate('cfg', cfg);
  app.decorate('db', deps.pool);
  app.decorate('tokens', tokens);
  app.decorate('verifyGoogle', deps.verifyGoogle ?? googleVerifier(cfg.googleClientIds));
  app.decorate('ayahCounts', ayahCounts);

  await app.register(cors, {
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  // Authentification : « Authorization: Bearer <jeton d'accès> ».
  app.decorate('authenticate', async (req) => {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('Bearer ')) throw new HttpError(401, 'unauthenticated', 'Connexion requise.');
    let payload;
    try {
      payload = await tokens.verify(h.slice(7));
    } catch {
      throw new HttpError(401, 'invalid_token', 'Session expirée.');
    }
    const [rows] = await deps.pool.query(
      'SELECT id, email, display_name, role, status FROM users WHERE id = ?', [payload.sub]);
    const u = rows[0];
    if (!u || u.status !== 'active') throw new HttpError(401, 'account_disabled', 'Compte désactivé.');
    req.user = u;
  });
  app.decorate('requireAdmin', async (req) => {
    await app.authenticate(req);
    if (req.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Réservé aux administrateurs.');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err.validation) {
      return reply.code(400).send({ error: 'invalid_request', message: err.message });
    }
    if (err.statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Trop de tentatives, réessayez plus tard.' });
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'error', message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'server_error', message: 'Erreur interne.' });
  });

  app.get('/health', async () => {
    await deps.pool.query('SELECT 1');
    return { ok: true };
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(groupRoutes, { prefix: '/groups' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(orgRoutes, { prefix: '/orgs' });
  await app.register(inviteRoutes);
  await app.register(geocodeRoutes);
  await app.register(downloadRoutes);
  return app;
}
