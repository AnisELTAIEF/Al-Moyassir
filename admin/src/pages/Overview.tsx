import { useAsync, Bar } from '../components';
import { fmtPct, inactiveMembers, sinceLabel } from '../lib';
import type { Api } from '../types';
import { TOTAL_AYAHS } from '../data/surahs';

export default function Overview({ api, onOpenUsers }: { api: Api; onOpenUsers: () => void }) {
  const stats = useAsync(() => api.stats(), []);
  const users = useAsync(() => api.users(), []);
  const s = stats.data;
  const list = users.data ?? [];
  const inactive = inactiveMembers(list.filter((u) => u.status === 'active'));
  const top = [...list].sort((a, b) => b.memorized - a.memorized).slice(0, 5);
  const best = Math.max(1, ...top.map((u) => u.memorized));

  return (
    <>
      <h1>Aperçu</h1>
      {(stats.error || users.error) && <p className="error">{stats.error ?? users.error}</p>}
      {s && (
        <div className="stats">
          <div className="card stat"><span>Utilisateurs</span><strong>{s.users}</strong><small>{s.admins} administrateur(s)</small></div>
          <div className="card stat"><span>Actifs sur 7 jours</span><strong>{s.active7Days}</strong><small>sur {s.activeUsers} comptes actifs</small></div>
          <div className="card stat"><span>Ayat appris au total</span><strong>{s.memorizedTotal.toLocaleString('fr-FR')}</strong><small>soit {(s.memorizedTotal / TOTAL_AYAHS).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} khatma(s)</small></div>
          <div className="card stat"><span>Invitations en attente</span><strong>{s.pendingInvitations}</strong><small>{s.groups} groupe(s)</small></div>
        </div>
      )}
      <div className="two">
        <section className="card">
          <h2>Les plus avancés</h2>
          <ul className="list">
            {top.map((u) => (
              <li key={u.id}><span>{u.displayName}</span><Bar value={u.memorized / best} /><span className="muted num">{u.memorized} · {fmtPct(u.memorized)}</span></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Sans activité depuis 7 jours</h2>
          {inactive.length === 0 ? <p className="muted">Tout le monde a révisé cette semaine.</p> : (
            <ul className="list plain">
              {inactive.slice(0, 8).map((u) => <li key={u.id}><span>{u.displayName}</span><span className="warn">{sinceLabel(u.lastActivity)}</span></li>)}
            </ul>
          )}
          <button className="btn ghost small" onClick={onOpenUsers}>Voir tous les utilisateurs</button>
        </section>
      </div>
    </>
  );
}
