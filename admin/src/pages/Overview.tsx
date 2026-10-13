import { useAsync, Bar } from '../components';
import { fmtPct, inactiveMembers, sinceLabel } from '../lib';
import type { Api } from '../types';
import { TOTAL_AYAHS } from '../data/surahs';

type Dest = 'users' | 'invitations' | 'groups';

export default function Overview({ api, onNavigate }: { api: Api; onNavigate: (p: Dest) => void }) {
  const stats = useAsync(() => api.stats(), []);
  const users = useAsync(() => api.users(), []);
  const s = stats.data;
  const list = users.data ?? [];
  const active = list.filter((u) => u.status === 'active');
  const inactive = inactiveMembers(active);
  const top = [...list].sort((a, b) => b.memorized - a.memorized).slice(0, 5);
  const avg = active.length ? Math.round(active.reduce((a, u) => a + u.memorized, 0) / active.length) : 0;

  const Stat = ({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: Dest }) => {
    const body = (<><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</>);
    return to
      ? <button type="button" className="card stat click" onClick={() => onNavigate(to)}>{body}</button>
      : <div className="card stat">{body}</div>;
  };

  return (
    <>
      <h1>Aperçu</h1>
      {(stats.error || users.error) && <p className="error">{stats.error ?? users.error}</p>}
      {s && (
        <div className="stats">
          <Stat label="Utilisateurs" value={String(s.users)} hint={`${s.admins} administrateur(s)`} to="users" />
          <Stat label="Actifs sur 7 jours" value={String(s.active7Days)} hint={`sur ${s.activeUsers} comptes actifs`} to="users" />
          <Stat label="Ayat appris au total" value={s.memorizedTotal.toLocaleString('fr-FR')}
            hint={`soit ${(s.memorizedTotal / TOTAL_AYAHS).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} khatma(s)`} />
          <Stat label="Invitations en attente" value={String(s.pendingInvitations)} hint={`${s.groups} groupe(s)`} to="invitations" />
        </div>
      )}

      {s && active.length > 0 && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="row"><h2 style={{ margin: 0 }}>Progression moyenne</h2><span className="muted num">{avg} ayat · {fmtPct(avg)} du Coran</span></div>
          <div style={{ marginTop: 10 }}><Bar value={avg / TOTAL_AYAHS} label="Part moyenne du Coran apprise par personne active" /></div>
        </section>
      )}

      <div className="two">
        <section className="card">
          <h2>Les plus avancés</h2>
          {top.length === 0 ? <p className="muted">Aucune progression pour l’instant.</p> : (
            <ul className="list">
              {top.map((u) => (
                <li key={u.id}>
                  <button className="link" onClick={() => onNavigate('users')}>{u.displayName}</button>
                  <Bar value={u.memorized / TOTAL_AYAHS} label={`Part du Coran apprise par ${u.displayName}`} />
                  <span className="muted num">{u.memorized} · {fmtPct(u.memorized)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Sans activité depuis 7 jours</h2>
          {inactive.length === 0 ? <p className="muted">Tout le monde a révisé cette semaine.</p> : (
            <ul className="list plain">
              {inactive.slice(0, 8).map((u) => (
                <li key={u.id}>
                  <button className="link" onClick={() => onNavigate('users')}>{u.displayName}</button>
                  <span className="warn">{sinceLabel(u.lastActivity)}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => onNavigate('users')}>Voir tous les utilisateurs</button>
        </section>
      </div>
    </>
  );
}
