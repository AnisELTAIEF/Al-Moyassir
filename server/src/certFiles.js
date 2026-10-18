// Fichiers des certificats : stockage hors base, type vérifié sur le contenu, liens de téléchargement à courte durée.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { SignJWT, jwtVerify } from 'jose';

export const MAX_CERT_BYTES = 5 * 1024 * 1024;

/** Type réel d'après les premiers octets (on ne croit jamais le type annoncé par le client). */
export function sniffMime(buf) {
  if (buf.length > 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Nom de fichier affichable : sans chemin ni caractères de contrôle. */
export const safeFileName = (n) => String(n ?? 'certificat').replace(/[\\/\x00-\x1f"]/g, '_').trim().slice(0, 160) || 'certificat';

export const certPath = (cfg, orgId, certId) => `${cfg.certDir}/${orgId}/${certId}`;

export async function saveCertificate(cfg, orgId, certId, buf) {
  await mkdir(`${cfg.certDir}/${orgId}`, { recursive: true, mode: 0o700 });
  await writeFile(certPath(cfg, orgId, certId), buf, { mode: 0o600 });
}

export const removeCertificate = (cfg, orgId, certId) => rm(certPath(cfg, orgId, certId), { force: true });

/** Supprime les fichiers de tous les certificats d'un élève (avant la purge définitive de sa fiche). */
export async function removeProfileFiles(db, cfg, profileId) {
  const [rows] = await db.query('SELECT id, organization_id FROM certificates WHERE profile_id = ?', [profileId]);
  for (const r of rows) await removeCertificate(cfg, r.organization_id, r.id);
}

const key = (cfg) => new TextEncoder().encode(cfg.jwtSecret);

/** Lien de téléchargement valable 5 minutes (le navigateur ne peut pas envoyer d'en-tête d'authentification). */
export const signFileToken = (cfg, certId) =>
  new SignJWT({ purpose: 'certificate', cid: certId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setIssuer('fifidh-api').setExpirationTime('5m').sign(key(cfg));

export async function verifyFileToken(cfg, token, certId) {
  try {
    const { payload } = await jwtVerify(token, key(cfg), { issuer: 'fifidh-api' });
    return payload.purpose === 'certificate' && payload.cid === certId;
  } catch {
    return false;
  }
}
