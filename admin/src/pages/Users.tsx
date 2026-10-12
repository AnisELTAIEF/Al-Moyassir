import { useMemo, useState } from 'react';
import { Bar, ProgressPanel, useAsync } from '../components';
import { daysSince, downloadCsv, fmtPct, membersCsv, sinceLabel } from '../lib';
import type { Api, User, UserStats } from '../types';

export default function Users({ api, me }: { api: Api; me: User }) {
  const { data, error, reload } = useAsync(() => api.users(), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<UserStats | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const best = Math.max(1, ...(data ?? []).map((u) => u.memorized));
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((u) => !s || u.displayName.toLowerCase().includes(s) || u.email.includes(s))
      .sort((a, b) => b.memorized - a.memorized);
  }, [data, q]);

  async function act(f: () => Promise<void>, ok: string) {
    setMsg(null);
    try { await f(); setMsg(ok); reload(); } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className={sel ? 'with-panel' : ''}>
      <section>
        <div className="row"><h1>Utilisateurs</h1>
          <button className="btn ghost" onClick={() => downloadCsv('utilisateurs_hifidh', membersCsv(data ?? []))}>Exporter en CSV</button></div>
        <div className="toolbar"><input placeholder="Rechercher un nom ou un e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" /></div>
        {msg && <p className="note" role="status">{msg}</p>}
        {error && <p className="error">{error}</p>}
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Personne</th><th>Ayat appris</th><th>Dernière activité</th><th>Rôle</th><th>Compte</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={sel?.id === u.id ? 'sel' : ''}>
                  <td><button className="link" onClick={() => setSel(u)}>{u.displayName}</button><div className="muted small">{u.email}</div></td>
                  <td><div className="prog"><Bar value={u.memorized / best} /><span>{u.memorized} <small className="muted">{fmtPct(u.memorized)}</small></span></div></td>
                  <td className={(daysSince(u.lastActivity) ?? 99) >= 7 ? 'warn' : ''}>{sinceLabel(u.lastActivity)}</td>
                  <td>
                    <select value={u.role} aria-label={`Rôle de ${u.displayName}`}
                      onChange={(e) => act(() => api.updateUser(u.id, { role: e.target.value as 'user' | 'admin' }), `Rôle de ${u.displayName} mis à jour`)}>
                      <option value="user">Utilisateur</option><option value="admin">Admin global</option>
                    </select>
                  </td>
                  <td>
                    {u.id === me.id ? <span className="muted small">vous</span> : (
                      <button className={`chip ${u.status === 'active' ? 'ok' : 'off'}`}
                        onClick={() => window.confirm(u.status === 'active' ? `Désactiver ${u.displayName} ? Il sera déconnecté partout.` : `Réactiver ${u.displayName} ?`) &&
                          act(() => api.updateUser(u.id, { status: u.status === 'active' ? 'disabled' : 'active' }), 'Compte mis à jour')}>
                        {u.status === 'active' ? 'Actif' : 'Désactivé'}</button>
                    )}
                  </td>
                  <td>{u.id !== me.id && (
                    <button className="btn ghost small danger-text" onClick={() => window.confirm(`Supprimer définitivement ${u.displayName} et sa progression ?`) &&
                      act(() => api.deleteUser(u.id), 'Compte supprimé')}>Supprimer</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {sel && <ProgressPanel key={sel.id} title={sel.displayName} subtitle={sel.email} load={() => api.userProgress(sel.id)} onClose={() => setSel(null)} />}
    </div>
  );
}
