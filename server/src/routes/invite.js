// Page publique « /invite/<code> » : affiche le code et les étapes, sans rien révéler d'autre.
import { normalizeCode } from '../security.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default async function inviteRoutes(app) {
  app.get('/invite/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const code = normalizeCode(req.params.code);
    const valid = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
    reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invitation — Almoyassir (الميسّر)</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0f2a22;color:#f4efe2;display:grid;place-items:center;min-height:100vh;padding:20px}
.c{max-width:420px;text-align:center}.code{font:700 34px/1 ui-monospace,monospace;letter-spacing:4px;background:#f4efe2;color:#0f2a22;border-radius:14px;padding:18px;margin:20px 0}
.ar{font-size:28px;color:#d9b45a}ol{text-align:left;line-height:1.7}</style></head><body><div class="c">
<div class="ar">حِفْظُ القُرْآن</div><h1>Vous êtes invité(e)</h1>
${valid ? `<p>Votre code d’invitation :</p><div class="code">${esc(code)}</div>
<ol><li>Installez l’application <b>Almoyassir (الميسّر)</b>.</li><li>Touchez <b>« J’ai un code d’invitation »</b>.</li><li>Saisissez ce code, puis connectez-vous avec Google ou créez un mot de passe.</li></ol>`
      : '<p>Ce lien d’invitation n’est pas valide.</p>'}
</div></body></html>`;
  });
}
