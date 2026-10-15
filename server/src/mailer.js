// Envoi d'e-mails (invitations). Optionnel : actif seulement si SMTP_HOST est renseigné dans
// /etc/hifidh/api.env. Exemple Microsoft 365 : SMTP_HOST=smtp.office365.com, SMTP_PORT=587,
// SMTP_USER / SMTP_PASSWORD d'une boîte autorisée à l'envoi SMTP authentifié, MAIL_FROM.
import nodemailer from 'nodemailer';

let transport = null;
let transportKey = '';

/** Le serveur peut-il envoyer des e-mails ? */
export const mailEnabled = (cfg) => Boolean(cfg.smtp?.host && cfg.smtp?.from);

function getTransport(cfg) {
  const s = cfg.smtp;
  const key = `${s.host}:${s.port}:${s.user}:${s.requireTls}`;
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465, // 465 : TLS direct ; 587 : STARTTLS
      requireTLS: s.requireTls !== false && s.port !== 465,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    transportKey = key;
  }
  return transport;
}

/**
 * Envoie un e-mail. Ne lève jamais d'exception : renvoie true si le serveur SMTP l'a accepté,
 * false sinon (SMTP non configuré ou erreur, journalisée sans le mot de passe).
 */
export async function sendMail(app, { to, subject, text, html }) {
  if (!mailEnabled(app.cfg)) return false;
  try {
    await getTransport(app.cfg).sendMail({ from: app.cfg.smtp.from, to, subject, text, html });
    return true;
  } catch (err) {
    app.log.warn({ err: { code: err.code, message: err.message }, to }, 'envoi de l’e-mail impossible');
    return false;
  }
}
