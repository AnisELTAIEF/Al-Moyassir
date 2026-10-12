import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';

export const uuid = () => randomUUID();
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newRefreshToken = () => randomBytes(32).toString('base64url');

// Codes d'invitation lisibles : 8 caractères sans ambiguïté (pas de 0/O/1/I/L), ex. « K7XQ-M2PA ».
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newInvitationCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const normalizeCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');

export const hashPassword = (p) => bcrypt.hash(p, 12);
export const checkPassword = (p, h) => (h ? bcrypt.compare(p, h) : Promise.resolve(false));

export function tokenService(secret, accessTtlSeconds) {
  const key = new TextEncoder().encode(secret);
  return {
    async sign(user) {
      return new SignJWT({ role: user.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuedAt()
        .setIssuer('fifidh-api')
        .setExpirationTime(`${accessTtlSeconds}s`)
        .sign(key);
    },
    async verify(token) {
      const { payload } = await jwtVerify(token, key, { issuer: 'fifidh-api', algorithms: ['HS256'] });
      return payload;
    },
  };
}

/**
 * Vérifie un ID token Google (signature via les clés publiques de Google, émetteur, audience, e-mail vérifié).
 * Renvoie { sub, email, name }.
 */
export function googleVerifier(clientIds) {
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  return async (idToken) => {
    if (!clientIds.length) throw Object.assign(new Error('google_not_configured'), { statusCode: 503 });
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientIds,
    });
    if (payload.email_verified !== true && payload.email_verified !== 'true') {
      throw Object.assign(new Error('email_not_verified'), { statusCode: 401 });
    }
    return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: payload.name ? String(payload.name) : '' };
  };
}
