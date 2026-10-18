// Alertes natives (application Android) : Firebase Cloud Messaging, API HTTP v1, avec un compte de service.
// Le fichier JSON du compte de service reste sur le serveur (jamais dans Git) : FCM_SERVICE_ACCOUNT_FILE.
import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Lit et contrôle le fichier du compte de service. */
export function readServiceAccount(file) {
  const sa = JSON.parse(readFileSync(file, 'utf8'));
  if (sa.type !== 'service_account' || !sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error(`${file} n'est pas un compte de service Firebase.`);
  }
  return sa;
}

/**
 * Expéditeur FCM : `(jeton, { title, body, data }) => Promise`, ou null sans compte de service.
 * En cas d'échec, l'erreur porte `statusCode` et `unregistered` (jeton à oublier : app désinstallée…).
 */
export function makeFcmSender(cfg, { fetchImpl = fetch, serviceAccount } = {}) {
  const file = cfg.fcm.serviceAccountFile;
  if (!file && !serviceAccount) return null;
  const sa = serviceAccount ?? readServiceAccount(file);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  let cached = null; // jeton d'accès Google (valable 1 h) : { token, exp }

  async function accessToken() {
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id })
      .setIssuer(sa.client_email).setSubject(sa.client_email).setAudience(tokenUri)
      .setIssuedAt(now).setExpirationTime(now + 3600)
      .sign(await importPKCS8(sa.private_key, 'RS256'));
    const res = await fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`jeton Google refusé (${res.status})`);
    const j = await res.json();
    cached = { token: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  return async (token, { title, body, data = {} }) => {
    const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data, // valeurs texte uniquement
          android: { priority: 'high', ttl: '86400s', notification: { channel_id: 'alertes' } },
        },
      }),
    });
    if (res.ok) return;
    const j = await res.json().catch(() => ({}));
    const codes = (j?.error?.details ?? []).map((d) => d.errorCode).filter(Boolean);
    const e = new Error(j?.error?.message ?? `FCM ${res.status}`);
    e.statusCode = res.status;
    e.unregistered = res.status === 404 || codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH');
    if (res.status === 401) cached = null; // jeton d'accès révoqué : en redemander un au prochain envoi
    throw e;
  };
}
