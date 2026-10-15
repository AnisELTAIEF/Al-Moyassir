// Création d'invitations (admins globaux et admins de groupe).
import { HttpError } from './errors.js';
import { uuid, sha256, newInvitationCode } from './security.js';
import { iso } from './users.js';
import { buildInvitationMail } from './inviteMail.js';
import { mailEnabled, sendMail } from './mailer.js';

/**
 * Crée une invitation et renvoie le code (affiché une seule fois) et un message prêt à partager.
 * Les invitations en attente pour le même e-mail et le même groupe sont remplacées.
 */
export async function createInvitation(app, { email, role = 'user', groupId = null, groupRole = 'member', invitedBy, displayName = null, deferMail = false }) {
  email = email.trim().toLowerCase();
  displayName = displayName?.trim().slice(0, 80) || null;
  const [exists] = await app.db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists.length) throw new HttpError(409, 'already_member', 'Cette personne a déjà un compte.');
  let groupName = null;
  if (groupId) {
    const [g] = await app.db.query('SELECT name FROM study_groups WHERE id = ?', [groupId]);
    if (!g.length) throw new HttpError(400, 'invalid_group', 'Groupe introuvable.');
    groupName = g[0].name;
  }
  await app.db.query(
    `UPDATE invitations SET revoked_at = UTC_TIMESTAMP(3)
     WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL AND (group_id <=> ?)`, [email, groupId]);
  const code = newInvitationCode();
  const id = uuid();
  const expires = new Date(Date.now() + app.cfg.invitationTtlDays * 86_400_000);
  await app.db.query(
    `INSERT INTO invitations (id, email, code_hash, role, group_id, group_role, invited_by, expires_at, display_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, email, sha256(code), role, groupId, groupRole, invitedBy, expires, displayName]);
  const link = app.cfg.publicUrl ? `${app.cfg.publicUrl}/invite/${code}` : null;
  const [inv] = await app.db.query('SELECT display_name FROM users WHERE id = ?', [invitedBy]);
  const mail = buildInvitationMail(app.cfg, {
    email, code, role, groupId, groupRole, groupName, displayName,
    inviterName: inv[0]?.display_name ?? null,
    expiresAt: expires,
  });
  // Envoi automatique si le SMTP est configuré ; sinon l'admin copie le message (comme avant).
  // deferMail : l'appelant (import en masse) envoie les e-mails après coup, en arrière-plan.
  const emailed = mailEnabled(app.cfg) && !deferMail ? await sendInvitationMail(app, id, email, mail) : false;
  return {
    id, email, role, groupId, groupRole, displayName, code, link, expiresAt: expires.toISOString(),
    ...(deferMail ? { pendingMail: mail } : {}),
    subject: mail.subject,
    message: mail.text,
    emailed,
    mailConfigured: mailEnabled(app.cfg),
  };
}

/** Envoie l'e-mail d'une invitation et note la date d'envoi si tout s'est bien passé. */
export async function sendInvitationMail(app, id, email, mail) {
  const ok = await sendMail(app, { to: email, ...mail });
  if (ok) await app.db.query('UPDATE invitations SET emailed_at = UTC_TIMESTAMP(3) WHERE id = ?', [id]);
  return ok;
}

export const invitationRow = (r) => ({
    id: r.id, email: r.email, role: r.role, groupId: r.group_id, groupName: r.group_name ?? null, groupRole: r.group_role,
    invitedBy: r.inviter_name ?? null, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at),
    acceptedAt: iso(r.accepted_at), revokedAt: iso(r.revoked_at),
    displayName: r.display_name ?? null, emailedAt: iso(r.emailed_at),
    state: r.accepted_at ? 'accepted' : r.revoked_at ? 'revoked' : new Date(r.expires_at) < new Date() ? 'expired' : 'pending',
  });
