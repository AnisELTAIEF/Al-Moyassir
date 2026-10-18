// Notifications : enregistrées en base (centre de notifications de l'app) et, si configuré, poussées sur les
// appareils abonnés (Web Push, et FCM pour l'app Android) pour prévenir l'élève même app fermée. L'envoi push ne fait JAMAIS échouer l'action.
import webpush from 'web-push';

/** Expéditeur Web Push, ou null si les clés VAPID ne sont pas configurées. */
export function makePushSender(cfg) {
  const { publicKey, privateKey, subject } = cfg.vapid;
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return (subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 86_400 });
}

/** Texte d'une alerte : bilingue (arabe · français), car la langue du compte n'est pas connue du serveur. */
export function pushText(kind, p = {}) {
  const org = p.organizationName ?? '';
  switch (kind) {
    case 'retake_pages': {
      const pages = p.pageInfo?.length ? p.pageInfo.map((x) => `${x.page} (${x.name})`) : (p.pages ?? []);
      return ['صفحة للإعادة · Page à reprendre', `${pages.join('، ')} — ${org}`];
    }
    case 'review_ayat': {
      // « البقرة 5–7 · يس 12 (4) — association » : sourate, ayat et nombre.
      const refs = (p.refs ?? []).map((x) => `${x.name} ${x.from === x.to ? x.from : `${x.from}–${x.to}`}`);
      return [`آيات للمراجعة (${p.count ?? refs.length}) · Ayat à revoir`, `${refs.join(' · ')} — ${org}`];
    }
    case 'certificate': return ['شهادة جديدة · Nouveau certificat', p.title ?? ''];
    case 'reward': return [p.rewardKind === 'gift' ? 'هدية · Cadeau' : 'تشجيع · Encouragement', p.title ?? ''];
    default: return ['الميسّر · Almoyassir', ''];
  }
}

/** Enregistre une notification (avec la connexion donnée : peut faire partie d'une transaction) ; renvoie son id. */
export async function addNotification(conn, userId, { kind, title, body = '', payload = {} }) {
  const [r] = await conn.query('INSERT INTO notifications (user_id, kind, title, body, payload) VALUES (?,?,?,?,?)',
    [userId, kind, title, body, JSON.stringify(payload)]);
  return Number(r.insertId);
}

/**
 * Envoie l'alerte push aux appareils de l'utilisateur ; supprime les abonnements expirés. Silencieux en cas d'échec.
 * [id] (notification enregistrée) : au toucher de l'alerte, l'app ouvre directement cette notification.
 */
export async function pushNotification(app, userId, { kind, payload = {}, id }) {
  const send = app.pushSender;
  const fcm = app.fcmSender;
  if (!send && !fcm) return;
  try {
    const [title, body] = pushText(kind, payload);
    if (send) {
      const [subs] = await app.db.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
      const message = JSON.stringify({ title, body, kind, id: id ?? null, url: id ? `/app/?notif=${id}` : '/app/' });
      for (const s of subs) {
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message);
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await app.db.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
          else app.log.warn({ err: e?.message }, 'push non envoyé');
        }
      }
    }
    if (fcm) {
      const [devices] = await app.db.query('SELECT id, token FROM fcm_tokens WHERE user_id = ?', [userId]);
      for (const d of devices) {
        try {
          await fcm(d.token, { title, body, data: id ? { kind, id: String(id) } : { kind } });
        } catch (e) {
          if (e?.unregistered) await app.db.query('DELETE FROM fcm_tokens WHERE id = ?', [d.id]);
          else app.log.warn({ err: e?.message }, 'alerte Android non envoyée');
        }
      }
    }
  } catch (e) {
    app.log.warn({ err: e?.message }, 'push indisponible');
  }
}
