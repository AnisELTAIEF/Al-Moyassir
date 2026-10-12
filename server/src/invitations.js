// Création d'invitations (admins globaux et admins de groupe).
import { HttpError } from './errors.js';
import { uuid, sha256, newInvitationCode } from './security.js';
import { iso } from './users.js';

/**
 * Crée une invitation et renvoie le code (affiché une seule fois) et un message prêt à partager.
 * Les invitations en attente pour le même e-mail et le même groupe sont remplacées.
 */
export async function createInvitation(app, { email, role = 'user', groupId = null, groupRole = 'member', invitedBy }) {
  email = email.trim().toLowerCase();
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
    `INSERT INTO invitations (id, email, code_hash, role, group_id, group_role, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, email, sha256(code), role, groupId, groupRole, invitedBy, expires]);
  const link = app.cfg.publicUrl ? `${app.cfg.publicUrl}/invite/${code}` : null;
  const where = groupName ? ` et le groupe « ${groupName} »` : '';
  return {
    id, email, role, groupId, groupRole, code, link, expiresAt: expires.toISOString(),
    message: `Assalamou alaykoum,\n\nVous êtes invité(e) à rejoindre Almoyassir (الميسّر)${where}.\n` +
      `Ouvrez l’application, choisissez « J’ai un code d’invitation » et saisissez : ${code}\n` +
      (link ? `Ou ouvrez ce lien : ${link}\n` : '') +
      `Vous pouvez aussi simplement vous connecter avec Google avec l’adresse ${email}.\n` +
      `Ce code expire le ${expires.toLocaleDateString('fr-FR')}.`,
  };
}

export const invitationRow = (r) => ({
    id: r.id, email: r.email, role: r.role, groupId: r.group_id, groupName: r.group_name ?? null, groupRole: r.group_role,
    invitedBy: r.inviter_name ?? null, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at),
    acceptedAt: iso(r.accepted_at), revokedAt: iso(r.revoked_at),
    state: r.accepted_at ? 'accepted' : r.revoked_at ? 'revoked' : new Date(r.expires_at) < new Date() ? 'expired' : 'pending',
  });
