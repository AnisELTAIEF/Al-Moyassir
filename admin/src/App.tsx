import { useCallback, useEffect, useState } from 'react';
import { api, configured } from './api';
import type { GroupSummary, MyGroup, OrgSummary, User } from './types';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Users from './pages/Users';
import Invitations from './pages/Invitations';
import GroupsPage from './pages/GroupsPage';
import GroupView from './pages/GroupView';
import Import from './pages/Import';
import { TrashPanel } from './pages/OrgTools';
import Orgs from './pages/Orgs';
import { ThemeToggle } from './theme';
import { lang, setLang, t } from './i18n';

type Page = 'overview' | 'users' | 'invitations' | 'groups' | 'orgs' | 'import' | 'trash';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [bootError, setBootError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);
  const [managed, setManaged] = useState<MyGroup[]>([]);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  useEffect(() => {
    if (!api) return;
    api.restore().then(setUser, (e: Error) => { setBootError(e.message); setUser(null); });
  }, []);
  useEffect(() => {
    if (user && api) api.myGroups().then((g) => setManaged(g.filter((x) => x.role === 'admin')), () => undefined);
    if (user && api) api.myOrgs().then(setOrgs, () => undefined);
  }, [user]);

  const go = useCallback((p: Page) => { setPage(p); setGroup(null); }, []);

  if (!api || (!configured && !api.demo)) {
    return (
      <main className="center">
        <div className="card narrow">
          <h1>Configuration requise</h1>
          <p>Copiez <code>.env.example</code> en <code>.env.local</code> et renseignez <code>VITE_API_URL</code>.</p>
          <p className="muted">Pour prévisualiser l’interface : <code>VITE_DEMO=1 npm run dev</code>.</p>
        </div>
      </main>
    );
  }
  if (user === undefined) return <main className="center"><p className="muted">Chargement…</p></main>;
  if (!user) return <Login api={api} onSignedIn={setUser} notice={bootError} />;

  const isAdmin = user.role === 'admin';
  // Le personnel d'un établissement (administratif, enseignant) accède au BO ; un simple élève/parent, non.
  const staffOrgs = orgs.filter((o) => o.roles.includes('admin') || o.roles.includes('teacher'));
  if (!isAdmin && managed.length === 0 && staffOrgs.length === 0) {
    return (
      <main className="center">
        <div className="card narrow">
          <h1>Accès réservé</h1>
          <p>Cet espace est destiné aux admins globaux, aux admins de groupe et à l’équipe des établissements (administratifs et enseignants). Votre progression personnelle se gère dans l’application mobile.</p>
          <button className="btn ghost" onClick={() => api!.signOut().then(() => setUser(null))}>Se déconnecter</button>
        </div>
      </main>
    );
  }

  const nav: [Page, string][] = isAdmin
    ? [['overview', 'Aperçu'], ['orgs', 'Établissements'], ['users', 'Utilisateurs'], ['invitations', 'Invitations'], ['groups', 'Groupes'], ['import', 'Import'], ['trash', 'Corbeille']]
    : [...(staffOrgs.length ? ([['orgs', staffOrgs.length > 1 ? 'Mes établissements' : 'Mon établissement']] as [Page, string][]) : []),
       ...(managed.length ? ([['groups', 'Mes groupes']] as [Page, string][]) : [])];
  const current = nav.some(([p]) => p === page) ? page : nav[0][0];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="ar brand-ar">الميسّر</span><span>Almoyassir</span><ThemeToggle /></div>
        <nav>
          {nav.map(([p, label]) => (
            <button key={p} className={current === p && !group ? 'on' : ''} aria-current={current === p ? 'page' : undefined} onClick={() => go(p)}>{t(label)}</button>
          ))}
        </nav>
        <div className="me">
          {api.demo && <span className="badge">{t('Démo')}</span>}
          <strong>{user.displayName}</strong>
          <span className="muted small">{user.email} · {isAdmin ? t('admin global') : t('admin de groupe')}</span>
          <a className="btn ghost small" href="/guide/" target="_blank" rel="noopener">{t('Guide d’utilisation')}</a>
          <button className="btn ghost small" onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}>{lang === 'ar' ? 'Français' : 'العربية'}</button>
          <button className="btn ghost small" onClick={() => api!.signOut().then(() => setUser(null))}>{t('Se déconnecter')}</button>
        </div>
      </aside>
      <main className="content">
        {group ? (
          <GroupView api={api} group={group} isGlobalAdmin={isAdmin} meId={user.id} onBack={() => setGroup(null)} />
        ) : current === 'overview' ? (
          <Overview api={api} onNavigate={go} />
        ) : current === 'orgs' ? (
          <Orgs api={api} me={user} />
        ) : current === 'users' ? (
          <Users api={api} me={user} />
        ) : current === 'invitations' ? (
          <Invitations api={api} />
        ) : current === 'import' ? (
          <Import api={api} />
        ) : current === 'trash' ? (
          <>
            <h1>{t('Corbeille')}</h1>
            <TrashPanel showOrg load={() => api!.adminTrash()} restore={(id) => api!.restoreAdminTrash(id)} purge={(id) => api!.purgeAdminTrash(id)} />
          </>
        ) : (
          <GroupsPage api={api} isAdmin={isAdmin}
            managed={managed.map((g): GroupSummary => ({ id: g.id, name: g.name, members: g.members, managers: 1 }))}
            onOpen={(g) => setGroup(g)} />
        )}
      </main>
    </div>
  );
}
