import { FormEvent, useState } from 'react';
import { useAsync } from '../components';
import { fmtDate } from '../lib';
import type { Api, CreatedInvitation, Role } from '../types';

const STATE: Record<string, string> = { pending: 'En attente', accepted: 'Acceptée', revoked: 'Révoquée', expired: 'Expirée' };

export default function Invitations({ api }: { api: Api }) {
  const list = useAsync(() => api.invitations(), []);
  const groups = useAsync(() => api.groups(), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [groupId, setGroupId] = useState('');
  const [groupAdmin, setGroupAdmin] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      setCreated(await api.invite(email.trim(), role, groupId || null, groupId && groupAdmin ? 'admin' : 'member'));
      setEmail('');
      setCopied(false);
      list.reload();
    } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <>
      <h1>Invitations</h1>
      <p className="muted lead">L’accès à l’application se fait uniquement sur invitation. La personne reçoit un code à saisir dans l’app, ou se connecte simplement avec Google si c’est la même adresse.</p>
      <form className="card invite-form" onSubmit={submit}>
        <label>E-mail<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@gmail.com" /></label>
        <label>Rôle<select value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="user">Utilisateur</option><option value="admin">Admin global</option></select></label>
        <label>Groupe<select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Aucun</option>{(groups.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        {groupId && <label className="check"><input type="checkbox" checked={groupAdmin} onChange={(e) => setGroupAdmin(e.target.checked)} /> Admin du groupe</label>}
        <button className="btn">Créer l’invitation</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      {created && (
        <div className="card created" role="status">
          <div>
            <p>Invitation créée pour <strong>{created.email}</strong>. Le code ne sera plus affiché ensuite :</p>
            <div className="code">{created.code}</div>
            {created.link && <p className="muted small">Lien : {created.link}</p>}
          </div>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(created.message); setCopied(true); }}>{copied ? 'Message copié' : 'Copier le message à envoyer'}</button>
        </div>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>E-mail</th><th>État</th><th>Rôle</th><th>Groupe</th><th>Expire le</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td><span className={`chip ${i.state === 'accepted' ? 'ok' : i.state === 'pending' ? 'wait' : 'off'}`}>{STATE[i.state]}</span></td>
                <td>{i.role === 'admin' ? 'Admin global' : 'Utilisateur'}</td>
                <td>{i.groupName ? `${i.groupName}${i.groupRole === 'admin' ? ' (admin)' : ''}` : '—'}</td>
                <td>{i.state === 'pending' ? fmtDate(i.expiresAt) : '—'}</td>
                <td>{i.state === 'pending' && <button className="btn ghost small danger-text" onClick={() => window.confirm(`Révoquer l’invitation de ${i.email} ?`) &&
                  api.revokeInvitation(i.id).then(list.reload, (e: Error) => setMsg(e.message))}>Révoquer</button>}</td>
              </tr>
            ))}
            {list.data?.length === 0 && <tr><td colSpan={6} className="muted">Aucune invitation pour l’instant.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
