// Configuration lue depuis les variables d'environnement (voir ../.env.example).
const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  const cfg = {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    db: {
      host: env.DB_HOST ?? '127.0.0.1',
      port: Number(env.DB_PORT ?? 3306),
      user: env.DB_USER ?? 'fifidh',
      password: env.DB_PASSWORD ?? '',
      database: env.DB_NAME ?? 'fifidh',
      socketPath: env.DB_SOCKET || undefined,
    },
    jwtSecret: env.JWT_SECRET ?? '',
    accessTtlSeconds: Number(env.ACCESS_TTL_SECONDS ?? 900),
    refreshTtlDays: Number(env.REFRESH_TTL_DAYS ?? 60),
    invitationTtlDays: Number(env.INVITATION_TTL_DAYS ?? 14),
    bootstrapAdminEmail: (env.BOOTSTRAP_ADMIN_EMAIL ?? 'anis.eltaief@gmail.com').trim().toLowerCase(),
    googleClientIds: list(env.GOOGLE_CLIENT_IDS),
    corsOrigins: list(env.CORS_ORIGINS),
    publicUrl: (env.PUBLIC_URL ?? '').replace(/\/$/, ''),
    trustProxy: env.TRUST_PROXY !== 'false',
  };
  if (cfg.jwtSecret.length < 32) throw new Error('JWT_SECRET doit contenir au moins 32 caractères.');
  return cfg;
}
