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
    // Lien de téléchargement de l'app Android (APK), repris dans les e-mails d'invitation (optionnel).
    androidApkUrl: (env.ANDROID_APK_URL ?? '').trim(),
    apkFile: (env.APK_FILE ?? '/var/lib/hifidh/download/Almoyassir.apk').trim(),
    // Certificats des élèves (fichiers hors base). Le service n'y a le droit d'écrire que s'il figure dans ReadWritePaths.
    certDir: (env.CERT_DIR ?? '/var/lib/hifidh/certificates').trim().replace(/\/$/, ''),
    // Alertes quand l'app est fermée (Web Push). Sans clés : tout fonctionne, seules ces alertes sont désactivées.
    vapid: {
      publicKey: (env.VAPID_PUBLIC_KEY ?? '').trim(),
      privateKey: (env.VAPID_PRIVATE_KEY ?? '').trim(),
      subject: (env.VAPID_SUBJECT ?? 'mailto:anis.eltaief@gmail.com').trim(),
    },
    // Alertes natives de l'app Android (Firebase Cloud Messaging) : chemin du JSON du compte de service.
    // Sans fichier : seules ces alertes sont désactivées.
    fcm: {
      serviceAccountFile: (env.FCM_SERVICE_ACCOUNT_FILE ?? '').trim(),
    },
    // Envoi automatique des e-mails d'invitation (optionnel). Sans SMTP_HOST : rien n'est envoyé,
    // l'admin copie le message comme avant.
    smtp: {
      host: (env.SMTP_HOST ?? '').trim(),
      port: Number(env.SMTP_PORT ?? 587),
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASSWORD ?? '',
      from: (env.MAIL_FROM ?? env.SMTP_USER ?? '').trim(),
      requireTls: env.SMTP_REQUIRE_TLS !== 'false', // chiffrement obligatoire (sauf tests locaux)
    },
  };
  if (cfg.jwtSecret.length < 32) throw new Error('JWT_SECRET doit contenir au moins 32 caractères.');
  return cfg;
}
