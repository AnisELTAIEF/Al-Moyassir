// Téléchargement de l'application Android (APK) hébergée sur ce serveur.
// Le fichier est déposé par l'admin à l'emplacement APK_FILE (par défaut
// /var/lib/hifidh/download/Almoyassir.apk) ; il est servi à l'adresse /api/download/android.
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { HttpError } from '../errors.js';

/**
 * APK à servir : le fichier .apk le plus récemment ajouté dans le dossier de APK_FILE (on dépose
 * simplement le nouvel APK, sans le renommer). À défaut, APK_FILE lui-même.
 */
export function currentApk(cfg) {
  if (!cfg.apkFile) return null;
  let best = null;
  try {
    for (const name of readdirSync(dirname(cfg.apkFile))) {
      if (!/\.apk$/i.test(name)) continue;
      const file = join(dirname(cfg.apkFile), name);
      const st = statSync(file);
      if (st.isFile() && (!best || st.mtimeMs > best.st.mtimeMs)) best = { file, st };
    }
  } catch { /* dossier absent */ }
  if (best) return best;
  return existsSync(cfg.apkFile) ? { file: cfg.apkFile, st: statSync(cfg.apkFile) } : null;
}

/** Lien de téléchargement de l'APK : ANDROID_APK_URL s'il est défini, sinon le fichier hébergé ici. */
export function androidApkLink(cfg) {
  if (cfg.androidApkUrl) return cfg.androidApkUrl;
  if (cfg.publicUrl && currentApk(cfg)) return `${cfg.publicUrl}/api/download/android`;
  return null;
}

export default async function downloadRoutes(app) {
  app.get('/download/android', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const cur = currentApk(app.cfg);
    if (!cur) throw new HttpError(404, 'apk_missing', 'L’application Android n’est pas encore disponible au téléchargement.');
    const { file, st } = cur;
    reply
      .type('application/vnd.android.package-archive')
      .header('Content-Length', st.size)
      .header('Content-Disposition', `attachment; filename="${basename(file)}"`)
      .header('Last-Modified', st.mtime.toUTCString())
      .header('Cache-Control', 'no-cache');
    return reply.send(createReadStream(file));
  });
}
