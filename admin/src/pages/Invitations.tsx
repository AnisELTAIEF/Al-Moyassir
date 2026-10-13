import { FormEvent, useMemo, useState } from 'react';
import { useAsync, useFlash } from '../components';
import { fmtDate } from '../lib';
import type { Api, CreatedInvitation, Role } from '../types';

const STATE: Record<string, string> = { pending: 'En attente', accepted: 'Acceptée', revoked: 'Révoquée', expired: 'Expirée' };
type Filter = 'all' | 'pending' | 'accepted' | 'revoked' | 'expired';

export default function Invitations({ api }: { api: Api }) {
  const list = useAsync(() => api.invitations(), []);
  const groups = useAsync(() => api.groups(), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [groupId, setGroupId] = useState('');
  const [groupAdmin, setGroupAdmin] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [msg, setMsg] = useFlash();
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data ?? [])
      .filter((i) => filter === 'all' || i.state === filter)
      .filter((i) => !s || i.email.toLowerCase().includes(s) || (i.groupName ?? '').toLowerCase().includes(s));
  }, [list.data, q, filter]);

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

  const pendingCount = (list.data ?? []).filter((i) => i.state === 'pending').length;

  return (
    <>
      <h1>Invitations</h1>
      <p className="muted lead">L’inscription est ouverte : chacun peut créer un compte avec son e-mail. Les invitations servent à
        pré-attribuer un rôle ou à rattacher la personne à un groupe dès son arrivée — par un code à saisir dans l’app, ou par Google avec la même adresse.</p>
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

      <div className="toolbar">
        <input placeholder="Rechercher un e-mail ou un groupe" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une invitation" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filtrer par état">
          <option value="pending">En attente{pendingCount ? ` (${pendingCount})` : ''}</option>
          <option value="accepted">Acceptées</option>
          <option value="revoked">Révoquées</option>
          <option value="expired">Expirées</option>
          <option value="all">Toutes</option>
        </select>
      </div>
      {list.error && <p className="error">{list.error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>E-mail</th><th>État</th><th>Rôle</th><th>Groupe</th><th>Expire le</th><th /></tr></thead>
          <tbody>
            {rows.map((i) => (
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
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Aucune invitation{filter !== 'all' ? ` « ${STATE[filter]?.toLowerCase() ?? filter} »` : ''}.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
