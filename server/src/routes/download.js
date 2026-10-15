// Téléchargement de l'application Android (APK) hébergée sur ce serveur.
// Le fichier est déposé par l'admin à l'emplacement APK_FILE (par défaut
// /var/lib/hifidh/download/Almoyassir.apk) ; il est servi à l'adresse /api/download/android.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { HttpError } from '../errors.js';

/** Lien de téléchargement de l'APK : ANDROID_APK_URL s'il est défini, sinon le fichier hébergé ici. */
export function androidApkLink(cfg) {
  if (cfg.androidApkUrl) return cfg.androidApkUrl;
  if (cfg.publicUrl && cfg.apkFile && existsSync(cfg.apkFile)) return `${cfg.publicUrl}/api/download/android`;
  return null;
}

export default async function downloadRoutes(app) {
  app.get('/download/android', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const file = app.cfg.apkFile;
    if (!file || !existsSync(file)) throw new HttpError(404, 'apk_missing', 'L’application Android n’est pas encore disponible au téléchargement.');
    const st = statSync(file);
    reply
      .type('application/vnd.android.package-archive')
      .header('Content-Length', st.size)
      .header('Content-Disposition', 'attachment; filename="Almoyassir.apk"')
      .header('Last-Modified', st.mtime.toUTCString())
      .header('Cache-Control', 'no-cache');
    return reply.send(createReadStream(file));
  });
}
