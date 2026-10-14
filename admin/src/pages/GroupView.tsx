import { FormEvent, useMemo, useState } from 'react';
import { Bar, ProgressPanel, TOTAL, useAsync, useFlash } from '../components';
import { daysSince, downloadCsv, fmtDate, fmtPct, inactiveMembers, membersCsv, sinceLabel } from '../lib';
import type { Api, CreatedInvitation, UserStats } from '../types';

type SortKey = 'name' | 'memorized' | 'activity';

/** Un groupe : progression des membres et gestion (admins globaux et admins de ce groupe). */
export default function GroupView({ api, group, isGlobalAdmin, meId, onBack }: {
  api: Api; group: { id: string; name: string }; isGlobalAdmin: boolean; meId: string; onBack: () => void;
}) {
  const { data: members, error, reload } = useAsync(() => api.groupMembers(group.id), [group.id]);
  const pending = useAsync(() => api.groupInvitations(group.id), [group.id]);
  const joinCode = useAsync(() => api.groupJoinCode(group.id), [group.id]);
  const joinOpen = useAsync(() => api.groupJoinOpen(group.id), [group.id]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [name, setName] = useState(group.name);
  const [sel, setSel] = useState<UserStats | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'memorized', dir: -1 });
  const [email, setEmail] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useFlash();

  const list = members ?? [];
  const inactive = useMemo(() => new Set(inactiveMembers(list).map((m) => m.id)), [list]);
  const total = list.reduce((a, m) => a + m.memorized, 0);
  const admins = list.filter((m) => m.groupRole === 'admin').length;
  const rows = useMemo(() => {
    const v = (m: UserStats) => sort.key === 'name' ? m.displayName.toLowerCase() : sort.key === 'memorized' ? m.memorized : -(daysSince(m.lastActivity) ?? 9999);
    return list.filter((m) => !onlyInactive || inactive.has(m.id)).sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * sort.dir);
  }, [list, onlyInactive, inactive, sort]);

  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  async function act(f: () => Promise<void>, ok: string) {
    setMsg(null);
    try { await f(); setMsg(ok); reload(); pending.reload(); } catch (e) { setMsg((e as Error).message); }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setCreated(null);
    try {
      const r = await api.addMemberByEmail(group.id, email.trim(), asAdmin ? 'admin' : 'member');
      if ('added' in r) setMsg(`${r.email} a été ajouté(e) au groupe.`);
      else { setCreated(r); setCopied(false); }
      setEmail('');
      reload();
      pending.reload();
    } catch (err) { setMsg((err as Error).message); }
  }

  function rename() {
    const n = window.prompt('Nouveau nom du groupe', name);
    if (n && n.trim().length >= 2) act(async () => { await api.renameGroup(group.id, n.trim()); setName(n.trim()); }, 'Groupe renommé.');
  }

  return (
    <div className={sel ? 'with-panel' : ''}>
      <section>
        <button className="btn ghost small" onClick={onBack}>← Groupes</button>
        <div className="row">
          <h1>{name}</h1>
          <div className="row-actions">
            <button className="btn ghost" onClick={rename}>Renommer</button>
            <button className="btn ghost" onClick={() => downloadCsv(`${name}_progression`, membersCsv(list))}>Exporter en CSV</button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {members && (
          <div className="stats">
            <div className="card stat"><span>Membres</span><strong>{list.length}</strong><small>{admins} admin(s) du groupe</small></div>
            <div className="card stat"><span>Ayat appris (total)</span><strong>{total.toLocaleString('fr-FR')}</strong></div>
            <div className="card stat"><span>Moyenne par membre</span><strong>{list.length ? Math.round(total / list.length) : 0}</strong><small>{fmtPct(list.length ? total / list.length : 0)} du Coran</small></div>
            <div className="card stat"><span>Inactifs (7 j et plus)</span><strong className={inactive.size ? 'warn' : ''}>{inactive.size}</strong></div>
          </div>
        )}

        {joinCode.data && (
          <div className="card join-code">
            <div>
              <span className="muted">Code du groupe</span>
              <strong className="code">{joinCode.data}</strong>
              <small className="muted">À donner aux membres : dans l’app, « Créer un compte avec un code » (ou Compte → « Rejoindre un groupe »).</small>
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={joinOpen.data ?? true} disabled={joinOpen.data == null}
                  onChange={(e) => act(async () => { await api.setGroupJoinOpen(group.id, e.target.checked); joinOpen.reload(); },
                    e.target.checked ? 'Adhésion avec le code activée.' : 'Adhésion avec le code désactivée.')} />
                Autoriser l’adhésion avec ce code
              </label>
              {joinOpen.data === false && <small className="warn">Désactivée : pour l’instant, personne ne peut rejoindre le groupe avec ce code.</small>}
            </div>
            <div className="row-actions">
              <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(joinCode.data!).then(() => setCodeCopied(true))}>{codeCopied ? 'Copié ✓' : 'Copier'}</button>
              <button className="btn ghost small" onClick={() => window.confirm('Créer un nouveau code ? L’ancien ne permettra plus de rejoindre le groupe.') && api.regenerateJoinCode(group.id).then(() => { setCodeCopied(false); joinCode.reload(); })}>Nouveau code</button>
            </div>
          </div>
        )}

        <form className="card invite-form" onSubmit={add}>
          <label>Ajouter une personne (e-mail)<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@gmail.com" /></label>
          <label className="check"><input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} /> Admin du groupe</label>
          <span />
          <button className="btn">Ajouter</button>
          <p className="muted small span-all">Compte existant : ajout immédiat. Sinon, un code d’invitation est créé pour ce groupe.</p>
        </form>
        {created && (
          <div className="card created" role="status">
            <div>
              <p>Invitation créée pour <strong>{created.email}</strong>. Le code ne sera plus affiché ensuite :</p>
              <div className="code">{created.code}</div>
            </div>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(created.message); setCopied(true); }}>{copied ? 'Message copié' : 'Copier le message à envoyer'}</button>
          </div>
        )}
        {msg && <p className="note" role="status">{msg}</p>}

        <div className="toolbar">
          <label className="check"><input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} /> Inactifs seulement</label>
        </div>
        <div className="card table-wrap">
          <table>
            <thead><tr>{th('name', 'Membre')}{th('memorized', 'Ayat appris')}<th>En cours</th>{th('activity', 'Dernière activité')}<th>Rôle dans le groupe</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={sel?.id === m.id ? 'sel' : ''}>
                  <td><button className="link" onClick={() => setSel(m)}>{m.displayName}</button>{m.groupRole === 'admin' && <span className="badge">admin</span>}</td>
                  <td><div className="prog"><Bar value={m.memorized / TOTAL} label={`Part du Coran apprise par ${m.displayName}`} /><span>{m.memorized} <small className="muted">{fmtPct(m.memorized)}</small></span></div></td>
                  <td>{m.learning}</td>
                  <td className={inactive.has(m.id) ? 'warn' : ''}>{sinceLabel(m.lastActivity)}</td>
                  <td className="nowrap">
                    <select value={m.groupRole ?? 'member'} aria-label={`Rôle de ${m.displayName} dans le groupe`}
                      onChange={(e) => act(() => api.setGroupRole(group.id, m.id, e.target.value as 'admin' | 'member'), 'Rôle mis à jour.')}>
                      <option value="member">Membre</option><option value="admin">Admin du groupe</option>
                    </select>
                    <button className="btn ghost small danger-text" onClick={() => window.confirm(m.id === meId ? 'Quitter ce groupe ?' : `Retirer ${m.displayName} du groupe ?`) &&
                      act(() => api.removeMember(group.id, m.id), m.id === meId ? 'Vous avez quitté le groupe.' : 'Membre retiré.')}>{m.id === meId ? 'Quitter' : 'Retirer'}</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="muted">Aucun membre à afficher.</td></tr>}
            </tbody>
          </table>
        </div>

        {(pending.data?.length ?? 0) > 0 && (
          <>
            <h2>Invitations en attente</h2>
            <div className="card table-wrap">
              <table>
                <tbody>
                  {pending.data!.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>{i.groupRole === 'admin' ? 'Admin du groupe' : 'Membre'}</td>
                      <td className="muted">expire le {fmtDate(i.expiresAt)}</td>
                      <td><button className="btn ghost small danger-text" onClick={() => act(() => api.revokeGroupInvitation(group.id, i.id), 'Invitation révoquée.')}>Révoquer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="muted small">Les admins du groupe gèrent ses membres et voient leur progression, sans accès aux autres groupes.
          {isGlobalAdmin ? ' En tant qu’admin global, vous pouvez gérer tous les groupes.' : ''}</p>
      </section>
      {sel && <ProgressPanel key={sel.id} title={sel.displayName} subtitle={sel.email} load={() => api.memberProgress(group.id, sel.id)} onClose={() => setSel(null)} />}
    </div>
  );
}
