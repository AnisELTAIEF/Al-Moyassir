import { SURAHS } from './data/surahs';
import type { Api, AyahProgress, GroupSummary, Invitation, UserStats } from './types';

/** Données fictives pour prévisualiser l'interface sans serveur (VITE_DEMO=1). */
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const NAMES = ['Anis E.', 'Mariem T.', 'Yassine B.', 'Salma K.', 'Omar H.', 'Ines M.', 'Khalil R.', 'Nour S.', 'Amine G.', 'Rim D.'];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
function progressFor(i: number): AyahProgress[] {
  const r = rng(i + 7);
  const out: AyahProgress[] = [];
  const from = 114 - Math.max(2, Math.round(r() * 30) + (i % 3) * 6);
  for (let n = 114; n > from; n--) {
    const s = SURAHS[n - 1];
    const done = Math.round(s.ayahs * (n > 110 ? 1 : r()));
    for (let a = 1; a <= s.ayahs; a++) {
      const status = a <= done ? 'memorized' : r() < 0.3 ? 'learning' : null;
      if (!status) continue;
      const t = ago(Math.floor(r() * 40) + (i === 9 ? 20 : 0));
      out.push({ surah: n, ayah: a, status, memorizedAt: status === 'memorized' ? t : null, lastReviewedAt: r() < 0.4 ? t : null, reviewCount: Math.floor(r() * 4), updatedAt: t });
    }
  }
  return out;
}
const progress = new Map<string, AyahProgress[]>();
const users: UserStats[] = NAMES.map((name, i) => {
  const items = progressFor(i);
  progress.set(`u${i}`, items);
  return {
    id: `u${i}`, email: i === 0 ? 'anis.eltaief@gmail.com' : `${name.split(' ')[0].toLowerCase()}@exemple.tn`, displayName: name,
    role: i === 0 ? 'admin' : 'user', status: i === 7 ? 'disabled' : 'active',
    groupRole: i === 1 ? 'admin' : 'member',
    memorized: items.filter((p) => p.status === 'memorized').length,
    learning: items.filter((p) => p.status === 'learning').length,
    lastActivity: i === 4 ? null : items.reduce<string | null>((m, p) => (m && m > p.updatedAt ? m : p.updatedAt), null),
    lastLoginAt: ago(i),
  };
});
const groups: GroupSummary[] = [
  { id: 'g1', name: 'Halaqa du vendredi', members: 8, managers: 1 },
  { id: 'g2', name: 'Jeunes — Monastir', members: 4, managers: 0 },
];
const invitations: Invitation[] = [
  { id: 'i1', email: 'hamza@exemple.tn', role: 'user', groupName: 'Halaqa du vendredi', state: 'pending', createdAt: ago(2), expiresAt: ago(-12) },
  { id: 'i2', email: 'sarra@exemple.tn', role: 'user', groupName: null, state: 'accepted', createdAt: ago(9), expiresAt: ago(-5) },
];
const me = { id: 'u0', email: 'anis.eltaief@gmail.com', displayName: 'Anis E.', role: 'admin' as const };

export function createDemoApi(): Api {
  let signed = false;
  try { signed = localStorage.getItem('demo') === '1'; } catch { /* */ }
  const set = (v: boolean) => { signed = v; try { v ? localStorage.setItem('demo', '1') : localStorage.removeItem('demo'); } catch { /* */ } };
  const noop = async () => undefined;
  return {
    demo: true,
    googleClientId: null,
    restore: async () => (signed ? me : null),
    signIn: async () => { set(true); return me; },
    signInWithGoogle: async () => { set(true); return me; },
    signOut: async () => set(false),
    myGroups: async () => groups.map((g) => ({ id: g.id, name: g.name, role: 'admin' as const, members: g.members })),
    stats: async () => ({ users: users.length, admins: 1, activeUsers: 9, memorizedTotal: users.reduce((a, u) => a + u.memorized, 0), learners: 9, active7Days: 6, pendingInvitations: 1, groups: 2 }),
    users: async () => users.map((u) => ({ ...u })),
    updateUser: async (id, p) => { const u = users.find((x) => x.id === id)!; Object.assign(u, p); },
    deleteUser: noop,
    userProgress: async (id) => progress.get(id) ?? [],
    invitations: async () => [...invitations],
    invite: async (email, role) => {
      invitations.unshift({ id: `i${invitations.length + 1}`, email, role, groupName: null, state: 'pending', createdAt: new Date().toISOString(), expiresAt: ago(-14) });
      return { email, code: 'K7XQ-M2PA', link: 'https://quran.exemple.tn/invite/K7XQ-M2PA', expiresAt: ago(-14),
        message: `Vous êtes invité(e) à rejoindre Almoyassir (الميسّر). Code : K7XQ-M2PA` };
    },
    revokeInvitation: async (id) => { const i = invitations.find((x) => x.id === id); if (i) i.state = 'revoked'; },
    groups: async () => [...groups],
    createGroup: async (name) => { groups.push({ id: `g${groups.length + 1}`, name, members: 0, managers: 0 }); },
    renameGroup: async (id, name) => { groups.find((g) => g.id === id)!.name = name; },
    deleteGroup: noop,
    addUserToGroup: noop,
    setGroupRole: noop,
    removeMember: noop,
    addMemberByEmail: async (_g, email) => ({ invited: true as const, email, code: 'K7XQ-M2PA', link: null, expiresAt: ago(-14), message: `Code : K7XQ-M2PA` }),
    groupInvitations: async () => invitations.filter((i) => i.state === 'pending' && i.groupName),
    revokeGroupInvitation: noop,
    groupMembers: async (g) => (g === 'g1' ? users.slice(0, 8) : users.slice(2, 6)).map((u) => ({ ...u })),
    memberProgress: async (_g, u) => progress.get(u) ?? [],
  };
}
