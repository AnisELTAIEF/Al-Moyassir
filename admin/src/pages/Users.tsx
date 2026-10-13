import { useMemo, useState } from 'react';
import { Bar, ProgressPanel, TOTAL, useAsync, useFlash } from '../components';
import { daysSince, downloadCsv, fmtPct, membersCsv, sinceLabel } from '../lib';
import type { Api, GroupSummary, User, UserStats } from '../types';

export default function Users({ api, me }: { api: Api; me: User }) {
  const { data, error, reload } = useAsync(() => api.users(), []);
  const groups = useAsync(() => api.groups(), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<UserStats | null>(null);
  const [msg, setMsg] = useFlash();
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((u) => !s || u.displayName.toLowerCase().includes(s) || u.email.includes(s))
      .sort((a, b) => b.memorized - a.memorized);
  }, [data, q]);

  return (
    <div className={sel ? 'with-panel' : ''}>
      <section>
        <div className="row"><h1>Utilisateurs</h1>
          <button className="btn ghost" onClick={() => downloadCsv('utilisateurs_hifidh', membersCsv(data ?? []))}>Exporter en CSV</button></div>
        <div className="toolbar"><input placeholder="Rechercher un nom ou un e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" /></div>
        <p className="muted small">Touchez une personne pour ouvrir sa fiche : progression, groupes, rôle et actions.</p>
        {msg && <p className="note" role="status">{msg}</p>}
        {error && <p className="error">{error}</p>}
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Personne</th><th>Ayat appris</th><th>Dernière activité</th><th>Rôle</th><th>Compte</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={sel?.id === u.id ? 'sel' : ''}>
                  <td><button className="link" onClick={() => setSel(u)}>{u.displayName}</button><div className="muted small">{u.email}</div></td>
                  <td><div className="prog"><Bar value={u.memorized / TOTAL} label={`Part du Coran apprise par ${u.displayName}`} /><span>{u.memorized} <small className="muted">{fmtPct(u.memorized)}</small></span></div></td>
                  <td className={(daysSince(u.lastActivity) ?? 99) >= 7 ? 'warn' : ''}>{sinceLabel(u.lastActivity)}</td>
                  <td>{u.role === 'admin' ? <span className="badge">Admin global</span> : <span className="muted small">Utilisateur</span>}</td>
                  <td><span className={`chip ${u.status === 'active' ? 'ok' : 'off'}`}>{u.status === 'active' ? 'Actif' : 'Désactivé'}{u.id === me.id ? ' · vous' : ''}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="muted">Aucune personne à afficher.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {sel && (
        <ProgressPanel key={sel.id} title={sel.displayName} subtitle={sel.email} load={() => api.userProgress(sel.id)} onClose={() => setSel(null)}>
          <UserFiche api={api} user={sel} me={me} allGroups={groups.data ?? []} flash={setMsg} onChanged={reload} onClose={() => setSel(null)} />
        </ProgressPanel>
      )}
    </div>
  );
}

/** Bloc « Compte » de la fiche : statut, dernière connexion, rôle et actions. */
function UserFiche({ api, user, me, allGroups, flash, onChanged, onClose }: {
  api: Api; user: UserStats; me: User; allGroups: GroupSummary[]; flash: (m: string | null) => void; onChanged: () => void; onClose: () => void;
}) {
  const isMe = user.id === me.id;
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);

  async function run(f: () => Promise<void>, ok: string) {
    flash(null);
    try { await f(); flash(ok); onChanged(); } catch (e) { flash((e as Error).message); }
  }

  return (
    <>
      <h3>Compte</h3>
      <div className="fiche-meta">
        <span className={`chip ${status === 'active' ? 'ok' : 'off'}`}>{status === 'active' ? 'Actif' : 'Désactivé'}</span>
        {isMe && <span className="badge">vous</span>}
        <span className="muted small">Dernière connexion : {sinceLabel(user.lastLoginAt)}</span>
      </div>
      <label>Rôle global
        <select value={role} disabled={isMe} aria-label={`Rôle global de ${user.displayName}`}
          onChange={(e) => { const r = e.target.value as 'user' | 'admin'; setRole(r); run(() => api.updateUser(user.id, { role: r }), 'Rôle global mis à jour.'); }}>
          <option value="user">Utilisateur</option><option value="admin">Admin global</option>
        </select>
      </label>
      {!isMe && (
        <div className="row-actions">
          <button className="btn ghost small" onClick={() => {
            const next = status === 'active' ? 'disabled' : 'active';
            if (window.confirm(next === 'disabled' ? `Désactiver ${user.displayName} ? Il sera déconnecté partout.` : `Réactiver ${user.displayName} ?`)) {
              setStatus(next); run(() => api.updateUser(user.id, { status: next }), 'Compte mis à jour.');
            }
          }}>{status === 'active' ? 'Désactiver' : 'Réactiver'}</button>
          <button className="btn ghost small danger-text" onClick={() => window.confirm(`Supprimer définitivement ${user.displayName} et sa progression ?`) &&
            run(async () => { await api.deleteUser(user.id); onClose(); }, 'Compte supprimé.')}>Supprimer</button>
        </div>
      )}
      <UserGroups api={api} user={user} allGroups={allGroups} flash={flash} onChanged={onChanged} />
    </>
  );
}

/** Groupes d'une personne, dans sa fiche : voir, changer son rôle, retirer, ajouter. */
function UserGroups({ api, user, allGroups, flash, onChanged }: {
  api: Api; user: UserStats; allGroups: GroupSummary[]; flash: (m: string | null) => void; onChanged: () => void;
}) {
  const { data, error, reload } = useAsync(() => api.userGroups(user.id), [user.id]);
  const mine = data ?? [];
  const available = allGroups.filter((g) => !mine.some((m) => m.id === g.id));

  async function run(f: () => Promise<void>, ok: string) {
    flash(null);
    try { await f(); flash(ok); reload(); onChanged(); } catch (e) { flash((e as Error).message); }
  }

  return (
    <div className="user-groups">
      <h3>Groupes</h3>
      {error && <p className="error">{error}</p>}
      {data && mine.length === 0 && <p className="muted">Cette personne n’est dans aucun groupe.</p>}
      {mine.length > 0 && (
        <ul className="list plain">
          {mine.map((g) => (
            <li key={g.id}>
              <span>{g.name}</span>
              <span className="row-actions">
                <select value={g.role} aria-label={`Rôle de ${user.displayName} dans ${g.name}`}
                  onChange={(e) => run(() => api.setGroupRole(g.id, user.id, e.target.value as 'admin' | 'member'), 'Rôle dans le groupe mis à jour.')}>
                  <option value="member">Membre</option><option value="admin">Admin du groupe</option>
                </select>
                <button className="btn ghost small danger-text"
                  onClick={() => window.confirm(`Retirer ${user.displayName} de « ${g.name} » ?`) && run(() => api.removeMember(g.id, user.id), `Retiré(e) de « ${g.name} ».`)}>Retirer</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <select aria-label={`Ajouter ${user.displayName} à un groupe`} value=""
          onChange={(e) => { const g = available.find((x) => x.id === e.target.value); if (g) run(() => api.addUserToGroup(g.id, user.id, 'member'), `Ajouté(e) à « ${g.name} ».`); }}>
          <option value="">Ajouter à un groupe…</option>
          {available.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
    </div>
  );
}
