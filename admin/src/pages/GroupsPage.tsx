import { FormEvent, useMemo, useState } from 'react';
import { useAsync } from '../components';
import type { Api, GroupSummary } from '../types';

export default function GroupsPage({ api, isAdmin, managed, onOpen }: {
  api: Api; isAdmin: boolean; managed: GroupSummary[]; onOpen: (g: { id: string; name: string }) => void;
}) {
  const { data, error, reload } = useAsync(() => (isAdmin ? api.groups() : Promise.resolve(managed)), [isAdmin]);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((g) => !s || g.name.toLowerCase().includes(s));
  }, [data, q]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try { await api.createGroup(name.trim()); setName(''); reload(); } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <>
      <h1>{isAdmin ? 'Groupes' : 'Mes groupes'}</h1>
      {(error || msg) && <p className="error">{error ?? msg}</p>}
      {(data?.length ?? 0) > 6 && (
        <div className="toolbar"><input placeholder="Rechercher un groupe" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un groupe" /></div>
      )}
      <div className="grid">
        {list.map((g) => (
          <div key={g.id} className="card group-card">
            <button className="link big" onClick={() => onOpen(g)}>{g.name}</button>
            <span className="muted">{g.members} membres{g.managers ? ` · ${g.managers} admin(s) du groupe` : ''}{g.joinCode ? ` · code ${g.joinCode}` : ''}</span>
            {g.joinOpen === false && <span className="chip off" title="Le code ne permet pas de rejoindre le groupe">Adhésion fermée</span>}
            {isAdmin && (
              <div className="row-actions">
                <button className="btn ghost small" onClick={() => { const n = window.prompt('Nouveau nom du groupe', g.name); if (n && n.trim().length >= 2) api.renameGroup(g.id, n.trim()).then(reload); }}>Renommer</button>
                <button className="btn ghost small danger-text" onClick={() => window.confirm(`Supprimer « ${g.name} » ? Les membres et leur progression sont conservés.`) && api.deleteGroup(g.id).then(reload)}>Supprimer</button>
              </div>
            )}
          </div>
        ))}
        {data?.length === 0 && <p className="muted">Aucun groupe. {isAdmin ? 'Créez une halaqa, une classe ou une famille ci-dessous.' : ''}</p>}
        {(data?.length ?? 0) > 0 && list.length === 0 && <p className="muted">Aucun groupe ne correspond à « {q} ».</p>}
      </div>
      {isAdmin && (
        <form className="card inline-form" onSubmit={create}>
          <input placeholder="Nom du nouveau groupe" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} aria-label="Nom du nouveau groupe" />
          <button className="btn">Créer le groupe</button>
        </form>
      )}
    </>
  );
}
