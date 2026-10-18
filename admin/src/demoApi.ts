import { SURAHS } from './data/surahs';
import type { Api, AyahProgress, GroupSummary, ImportItem, ImportResult, Invitation, OrgClass, OrgMember, OrgSummary, Student, UserStats } from './types';

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
const joinOpen = new Map<string, boolean>();
const me = { id: 'u0', email: 'anis.eltaief@gmail.com', displayName: 'Anis E.', role: 'admin' as const };

/** Établissements fictifs (en mémoire) pour la démo. */
function demoOrgs() {
  const org: OrgSummary = { id: 'o1', name: 'جامع النور', type: 'mosque', address: 'شارع الجمهورية، طرابلس', errorThreshold: 3,
    roles: ['admin'], studentCount: 3, classCount: 2 };
  const orgs: OrgSummary[] = [org];
  const members: OrgMember[] = [
    { userId: 'u1', email: 'responsable@exemple.tn', displayName: 'Responsable', roles: ['admin'] },
    { userId: 'u2', email: 'prof1@exemple.tn', displayName: 'Prof Un', roles: ['teacher'] },
  ];
  const classes: OrgClass[] = [
    { id: 'c1', name: 'فوج 1', studentCount: 2, teachers: [{ userId: 'u2', displayName: 'Prof Un' }] },
    { id: 'c2', name: 'فوج 2', studentCount: 1, teachers: [] },
  ];
  const mk = (n: number, fullName: string, fatherName: string, age: number, classIds: string[], over: Partial<Student> = {}): Student => ({
    id: `p${n}`, organizationId: 'o1', fullName, fatherName, birthDate: `${2026 - age}-01-01`, age, gender: 'm', phone: `+21891000000${n}`,
    phoneVerified: n === 1, joinedAt: '2025-09-01', hifdhStartedAt: '2025-09-15', pastCompetitions: '', guardianConsentAt: ago(100),
    status: 'active', leftAt: null, retainUntil: null, linked: n === 1, classes: classes.filter((c) => classIds.includes(c.id)).map(({ id, name }) => ({ id, name })),
    createdAt: ago(100), ...over,
  });
  const students: Student[] = [mk(1, 'عبد الله بن محمد', 'محمد', 11, ['c1']), mk(2, 'يوسف بن علي', 'علي', 9, ['c1']), mk(3, 'مريم بنت أحمد', 'أحمد', 13, ['c2'], { gender: 'f' })];
  return { org, orgs, members, classes, students };
}

export function createDemoApi(): Api {
  const d = demoOrgs();
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
    activity: async (days = 30) => {
      const r = rng(42);
      return Array.from({ length: days }, (_, i) => ({
        day: new Date(Date.now() - (days - 1 - i) * DAY).toISOString().slice(0, 10),
        memorized: Math.round(r() * 18) + (i % 7 === 5 ? 12 : 0),
      }));
    },
    users: async () => users.map((u) => ({ ...u })),
    updateUser: async (id, p) => { const u = users.find((x) => x.id === id)!; Object.assign(u, p); },
    deleteUser: noop,
    resetUserPassword: async () => ({ code: 'R3ST-2K9P', expiresAt: ago(-7), message: 'Réinitialisation de votre mot de passe Almoyassir. Dans l’app : « Mot de passe oublié », puis saisissez ce code : R3ST-2K9P' }),
    userProgress: async (id) => progress.get(id) ?? [],
    userGroups: async (id) => {
      const i = users.findIndex((u) => u.id === id);
      const out: { id: string; name: string; role: 'admin' | 'member' }[] = [];
      if (i >= 0 && i < 8) out.push({ id: 'g1', name: 'Halaqa du vendredi', role: i === 1 ? 'admin' : 'member' });
      if (i >= 2 && i < 6) out.push({ id: 'g2', name: 'Jeunes — Monastir', role: 'member' });
      return out;
    },
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
    importUsers: async (text, dryRun) => demoImport(text, dryRun, true),
    importToGroup: async (_g, text, dryRun) => demoImport(text, dryRun, false),
    groupInvitations: async () => invitations.filter((i) => i.state === 'pending' && i.groupName),
    revokeGroupInvitation: noop,
    groupJoinCode: async (g) => (g === 'g1' ? 'H7KQ2M' : 'P3XW9R'),
    regenerateJoinCode: async () => 'N4TB8Z',
    groupJoinOpen: async (g) => (joinOpen.get(g) ?? true),
    setGroupJoinOpen: async (g, open) => { joinOpen.set(g, open); },
    groupMembers: async (g) => (g === 'g1' ? users.slice(0, 8) : users.slice(2, 6)).map((u) => ({ ...u })),
    memberProgress: async (_g, u) => progress.get(u) ?? [],

    myOrgs: async () => d.orgs.map((o) => ({ ...o })),
    createOrg: async (i) => {
      const o: OrgSummary = { id: `o${d.orgs.length + 1}`, name: i.name, type: i.type, address: i.address, errorThreshold: 3, roles: [], studentCount: 0, classCount: 0 };
      d.orgs.push(o);
      return o;
    },
    updateOrg: async (id, patch) => Object.assign(d.orgs.find((o) => o.id === id)!, patch),
    orgMembers: async () => d.members.map((m) => ({ ...m })),
    addOrgMember: async (_o, email, role) => {
      const m = d.members.find((x) => x.email === email);
      if (m) { if (!m.roles.includes(role)) m.roles.push(role); } else d.members.push({ userId: `u${d.members.length + 1}`, email, displayName: email.split('@')[0], roles: [role] });
    },
    removeOrgMember: async (_o, userId, role) => {
      const m = d.members.find((x) => x.userId === userId);
      if (!m) return;
      m.roles = role ? m.roles.filter((r) => r !== role) : [];
      if (!m.roles.length) d.members.splice(d.members.indexOf(m), 1);
    },
    orgClasses: async () => d.classes.map((c) => ({ ...c, teachers: [...c.teachers] })),
    createClass: async (_o, name) => { d.classes.push({ id: `c${d.classes.length + 1}`, name, studentCount: 0, teachers: [] }); },
    renameClass: async (_o, id, name) => { const c = d.classes.find((x) => x.id === id); if (c) c.name = name; },
    deleteClass: async (_o, id) => { d.classes.splice(d.classes.findIndex((x) => x.id === id), 1); },
    setClassTeacher: async (_o, id, userId, on) => {
      const c = d.classes.find((x) => x.id === id);
      if (!c) return;
      c.teachers = c.teachers.filter((t) => t.userId !== userId);
      const m = d.members.find((x) => x.userId === userId);
      if (on && m) c.teachers.push({ userId, displayName: m.displayName });
    },
    setClassStudent: async (_o, id, pid, on) => {
      const s = d.students.find((x) => x.id === pid);
      const c = d.classes.find((x) => x.id === id);
      if (!s || !c) return;
      s.classes = s.classes.filter((x) => x.id !== id);
      if (on) s.classes.push({ id, name: c.name });
      c.studentCount = d.students.filter((x) => x.classes.some((k) => k.id === id) && x.status === 'active').length;
    },
    orgStudents: async (_o, f = {}) => d.students
      .filter((s) => (f.status === 'all' ? true : s.status === (f.status ?? 'active')))
      .filter((s) => !f.classId || s.classes.some((c) => c.id === f.classId))
      .filter((s) => !f.q?.trim() || `${s.fullName} ${s.fatherName} ${s.phone ?? ''}`.includes(f.q.trim()))
      .map((s) => ({ ...s })),
    createStudent: async (_o, input, classIds, confirm) => {
      const dups = d.students.filter((s) => s.fullName === input.fullName.trim() && s.fatherName === (input.fatherName ?? '').trim());
      if (dups.length && !confirm) return { duplicates: dups.map((s) => ({ id: s.id, fullName: s.fullName, fatherName: s.fatherName, status: s.status })) };
      const n = d.students.length + 1;
      const s: Student = { id: `p${n}`, organizationId: 'o1', fullName: input.fullName.trim(), fatherName: (input.fatherName ?? '').trim(),
        birthDate: input.birthDate ?? null, age: null, gender: input.gender ?? null, phone: input.phone ?? null, phoneVerified: false,
        joinedAt: input.joinedAt ?? null, hifdhStartedAt: input.hifdhStartedAt ?? null, pastCompetitions: input.pastCompetitions ?? '',
        guardianConsentAt: new Date().toISOString(), status: 'active', leftAt: null, retainUntil: null, linked: false,
        classes: d.classes.filter((c) => classIds.includes(c.id)).map(({ id, name }) => ({ id, name })), createdAt: new Date().toISOString() };
      d.students.push(s);
      return { student: s };
    },
    updateStudent: async (_o, id, patch) => {
      const s = d.students.find((x) => x.id === id)!;
      if ('phone' in patch && patch.phone !== s.phone) s.phoneVerified = false;
      return Object.assign(s, patch) as Student;
    },
    leaveStudent: async (_o, id) => Object.assign(d.students.find((x) => x.id === id)!, { status: 'left' as const, leftAt: new Date().toISOString().slice(0, 10), retainUntil: `${new Date().getFullYear() + 5}-12-31` }),
    restoreStudent: async (_o, id) => Object.assign(d.students.find((x) => x.id === id)!, { status: 'active' as const, leftAt: null, retainUntil: null }),
    deleteStudent: async (_o, id) => { d.students.splice(d.students.findIndex((x) => x.id === id), 1); },
    studentPhoneCode: async (_o, id) => ({ code: '482916', phone: d.students.find((x) => x.id === id)?.phone ?? '', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }),
    verifyStudentPhone: async (_o, id, code) => {
      if (code !== '482916') throw new Error('Code incorrect ou expiré.');
      d.students.find((x) => x.id === id)!.phoneVerified = true;
    },
    studentLinkCode: async () => ({ code: 'K7XQ-M2PA', expiresAt: ago(-7) }),
    unlinkStudent: async (_o, id) => { d.students.find((x) => x.id === id)!.linked = false; },
    studentSummary: async (_o, id) => (id === 'p1'
      ? { stats: { ayat: 412, surahs: { complete: 9, longestRun: 4 }, ahzab: { complete: 2, longestRun: 2 } }, retakePages: [37], threshold: 3, validatedAyat: 430 }
      : { stats: { ayat: 0, surahs: { complete: 0, longestRun: 0 }, ahzab: { complete: 0, longestRun: 0 } }, retakePages: [], threshold: 3, validatedAyat: 0 }),
  };
}

/** Démo : simulation simplifiée de l'import (aucune donnée réelle). */
function demoImport(text: string, dryRun: boolean, withGroup: boolean): ImportResult {
  const items: ImportItem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || (!line.includes('@') && i === 0)) return;
    const f = line.split(line.includes(';') ? ';' : ',').map((x) => x.trim());
    const at = f.findIndex((x) => x.includes('@'));
    if (at < 0) { items.push({ line: i + 1, email: null, name: null, group: null, role: null, action: 'error', message: 'Adresse e-mail manquante.', text: line }); return; }
    const group = withGroup ? f[0] || null : 'Groupe de démonstration';
    const name = (withGroup ? f.slice(1, at) : f.slice(0, at)).join(' ') || null;
    const role = withGroup && /admin/i.test(f[at + 1] ?? '') ? 'admin' : 'member';
    items.push({ line: i + 1, email: f[at].toLowerCase(), name, group, role, action: 'invited',
      message: dryRun ? 'Sera invité(e).' : 'Invité(e).', ...(dryRun ? {} : { code: 'K7XQ-M2PA', link: null }) });
  });
  const n = (a: ImportItem['action']) => items.filter((x) => x.action === a).length;
  return { dryRun, emailing: 0, mailConfigured: false, items,
    summary: { added: 0, updated: 0, invited: n('invited'), unchanged: 0, errors: n('error'), groupsCreated: [] } };
}
