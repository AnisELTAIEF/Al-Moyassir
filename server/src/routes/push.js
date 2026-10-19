// Abonnement aux alertes quand l'app est fermée : Web Push (version web / PWA installée) et FCM (app Android).
import { createHash } from 'node:crypto';
import { HttpError } from '../errors.js';

// Le serveur ENVOIE une requête à l'adresse fournie : on n'accepte que les services push officiels (sinon, SSRF).
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)$/;
export function validPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

export default async function pushRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;

  // Clé publique à donner au navigateur ; null si le serveur n'a pas de clés (alertes désactivées).
  // `native` : le serveur sait envoyer aux appareils Android (compte de service Firebase configuré).
  app.get('/push/key', async () => ({ publicKey: app.cfg.vapid.publicKey || null, native: Boolean(app.fcmSender) }));

  app.post('/push/subscribe', {
    schema: {
      body: {
        type: 'object',
        required: ['endpoint', 'keys'],
        properties: {
          endpoint: { type: 'string', maxLength: 2000 },
          keys: { type: 'object', required: ['p256dh', 'auth'], properties: { p256dh: { type: 'string', maxLength: 200 }, auth: { type: 'string', maxLength: 100 } } },
        },
      },
    },
  }, async (req) => {
    const { endpoint, keys } = req.body;
    if (!validPushEndpoint(endpoint)) throw new HttpError(400, 'invalid_endpoint', 'Service de notification non reconnu.');
    const hash = createHash('sha256').update(endpoint).digest('hex');
    await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [req.user.id, hash, endpoint, keys.p256dh, keys.auth]);
    // Au plus 10 appareils par compte : les plus anciens sont retirés.
    await db.query(
      `DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 10) t)`,
      [req.user.id, req.user.id]);
    return { ok: true };
  });

  // Invocation de l'heure (facultative) : préférence et décalage horaire de l'appareil, remis à jour à chaque ouverture.
  app.get('/push/dua', async (req) => {
    const [[r]] = await db.query('SELECT hourly, utc_offset_min FROM dua_prefs WHERE user_id = ?', [req.user.id]);
    return { hourly: Boolean(r?.hourly), utcOffsetMinutes: r?.utc_offset_min ?? 0 };
  });
  app.put('/push/dua', {
    schema: { body: { type: 'object', required: ['hourly', 'utcOffsetMinutes'], properties: { hourly: { type: 'boolean' }, utcOffsetMinutes: { type: 'integer', minimum: -840, maximum: 840 } } } },
  }, async (req) => {
    const { hourly, utcOffsetMinutes } = req.body;
    await db.query(
      `INSERT INTO dua_prefs (user_id, hourly, utc_offset_min) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE hourly = VALUES(hourly), utc_offset_min = VALUES(utc_offset_min)`,
      [req.user.id, hourly ? 1 : 0, utcOffsetMinutes]);
    return { hourly, utcOffsetMinutes };
  });

  app.post('/push/unsubscribe', { schema: { body: { type: 'object', required: ['endpoint'], properties: { endpoint: { type: 'string', maxLength: 2000 } } } } }, async (req) => {
    const hash = createHash('sha256').update(req.body.endpoint).digest('hex');
    await db.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [req.user.id, hash]);
    return { ok: true };
  });

  // App Android : jeton Firebase de l'appareil (il change de temps en temps : l'app le renvoie à chaque ouverture).
  const fcmBody = { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 20, maxLength: 4096 } } };
  app.post('/push/fcm', {
    schema: { body: { ...fcmBody, properties: { ...fcmBody.properties, platform: { type: 'string', enum: ['android', 'ios'] } } } },
  }, async (req) => {
    const { token, platform = 'android' } = req.body;
    const hash = createHash('sha256').update(token).digest('hex');
    await db.query(
      `INSERT INTO fcm_tokens (user_id, token_hash, token, platform) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform)`,
      [req.user.id, hash, token, platform]);
    // Au plus 10 appareils par compte : les plus anciens sont retirés.
    await db.query(
      `DELETE FROM fcm_tokens WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM fcm_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 10) t)`,
      [req.user.id, req.user.id]);
    return { ok: true };
  });

  app.post('/push/fcm/remove', { schema: { body: fcmBody } }, async (req) => {
    const hash = createHash('sha256').update(req.body.token).digest('hex');
    await db.query('DELETE FROM fcm_tokens WHERE user_id = ? AND token_hash = ?', [req.user.id, hash]);
    return { ok: true };
  });
}
