import type { Api, Student, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: unknown) { super(message); }
}

const KEY = 'hifidh-admin-refresh';
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v: string | null) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* navigation privée */ } },
};

/** Client de l'API Hifidh (jeton d'accès en mémoire, refresh token dans le navigateur). */
export function createRestApi(baseUrl: string, googleClientId: string | null): Api {
  const base = baseUrl.replace(/\/$/, '');
  let access: string | null = null;
  let refreshing: Promise<void> | null = null;

  async function raw(method: string, path: string, body?: unknown, auth = true): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && access) headers.Authorization = `Bearer ${access}`;
    try {
      return await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'network', 'Serveur injoignable. Vérifiez votre connexion.');
    }
  }

  async function refresh(): Promise<void> {
    refreshing ??= (async () => {
      const rt = store.get();
      if (!rt) throw new ApiError(401, 'unauthenticated', 'Connexion requise.');
      const res = await raw('POST', '/auth/refresh', { refreshToken: rt }, false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        store.set(null);
        access = null;
        throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Session expirée.');
      }
      access = data.accessToken;
      store.set(data.refreshToken);
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function call<T>(method: string, path: string, body?: unknown, auth = true, retried = false): Promise<T> {
    if (auth && !access && store.get()) await refresh();
    const res = await raw(method, path, body, auth);
    const data = await res.json().catch(() => null);
    if (res.ok) return data as T;
    if (auth && res.status === 401 && data?.error === 'invalid_token' && !retried) {
      access = null;
      await refresh();
      return call<T>(method, path, body, auth, true);
    }
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Erreur ${res.status}`, data);
  }

  async function session(r: { accessToken: string; refreshToken: string; user: User }) {
    access = r.accessToken;
    store.set(r.refreshToken);
    return r.user;
  }

  const items = <T>(r: { items: T[] }) => r.items;

  return {
    demo: false,
    googleClientId,
    async restore() {
      if (!store.get()) return null;
      try { return await call<User>('GET', '/me'); } catch (e) {
        if (e instanceof ApiError && e.status === 0) throw e;
        return null;
      }
    },
    signIn: async (email, password) => session(await call('POST', '/auth/login', { email, password }, false)),
    signInWithGoogle: async (idToken) => session(await call('POST', '/auth/google', { idToken }, false)),
    async signOut() {
      const rt = store.get();
      store.set(null);
      access = null;
      if (rt) await call('POST', '/auth/logout', { refreshToken: rt }, false).catch(() => undefined);
    },
    myGroups: async () => items(await call('GET', '/me/groups')),
    stats: () => call('GET', '/admin/stats'),
    activity: async (days = 30) => items(await call('GET', `/admin/activity?days=${days}`)),
    users: async () => items(await call('GET', '/admin/users')),
    updateUser: async (id, patch) => { await call('PATCH', `/admin/users/${id}`, patch); },
    deleteUser: async (id) => { await call('DELETE', `/admin/users/${id}`); },
    resetUserPassword: (id) => call('POST', `/admin/users/${id}/reset-password`),
    userProgress: async (id) => items(await call('GET', `/admin/users/${id}/progress`)),
    userGroups: async (id) => items(await call('GET', `/admin/users/${id}/groups`)),
    invitations: async () => items(await call('GET', '/admin/invitations')),
    invite: (email, role, groupId, groupRole = 'member') => call('POST', '/admin/invitations', { email, role, groupId, groupRole }),
    revokeInvitation: async (id) => { await call('DELETE', `/admin/invitations/${id}`); },
    groups: async () => items(await call('GET', '/admin/groups')),
    createGroup: async (name) => { await call('POST', '/admin/groups', { name }); },
    renameGroup: async (id, name) => { await call('PATCH', `/groups/${id}`, { name }); },
    deleteGroup: async (id) => { await call('DELETE', `/admin/groups/${id}`); },
    addUserToGroup: async (g, u, role) => { await call('PUT', `/admin/groups/${g}/members/${u}`, { role }); },
    setGroupRole: async (g, u, role) => { await call('PUT', `/groups/${g}/members/${u}`, { role }); },
    removeMember: async (g, u) => { await call('DELETE', `/groups/${g}/members/${u}`); },
    addMemberByEmail: async (g, email, role) => {
      const r = await call<Record<string, unknown>>('POST', `/groups/${g}/members`, { email, role });
      return r.added ? { added: true, email: (r.user as { email: string }).email } : (r as never);
    },
    importUsers: (text, dryRun) => call('POST', '/admin/import', { text, dryRun }),
    importToGroup: (g, text, dryRun) => call('POST', `/groups/${g}/import`, { text, dryRun }),
    groupInvitations: async (g) => items(await call('GET', `/groups/${g}/invitations`)),
    revokeGroupInvitation: async (g, i) => { await call('DELETE', `/groups/${g}/invitations/${i}`); },
    groupMembers: async (g) => (await call<{ members: never[] }>('GET', `/groups/${g}/overview`)).members,
    groupJoinCode: async (g) => (await call<{ group: { joinCode?: string | null } }>('GET', `/groups/${g}/overview`)).group.joinCode ?? null,
    regenerateJoinCode: async (g) => (await call<{ joinCode: string }>('POST', `/groups/${g}/join-code`)).joinCode,
    groupJoinOpen: async (g) => (await call<{ group: { joinOpen?: boolean } }>('GET', `/groups/${g}/overview`)).group.joinOpen ?? true,
    setGroupJoinOpen: async (g, open) => { await call('PUT', `/groups/${g}/join-open`, { open }); },
    memberProgress: async (g, u) => items(await call('GET', `/groups/${g}/members/${u}/progress`)),

    myOrgs: async () => (await call<{ organizations: never[] }>('GET', '/orgs')).organizations,
    createOrg: async (input) => (await call<{ organization: never }>('POST', '/orgs', input)).organization,
    updateOrg: async (id, patch) => (await call<{ organization: never }>('PATCH', `/orgs/${id}`, patch)).organization,
    orgMembers: async (o) => (await call<{ members: never[] }>('GET', `/orgs/${o}/members`)).members,
    addOrgMember: async (o, email, role) => { await call('PUT', `/orgs/${o}/members`, { email, role }); },
    removeOrgMember: async (o, u, role) => { await call('DELETE', `/orgs/${o}/members/${u}${role ? `?role=${role}` : ''}`); },
    orgClasses: async (o) => (await call<{ classes: never[] }>('GET', `/orgs/${o}/classes`)).classes,
    createClass: async (o, name) => { await call('POST', `/orgs/${o}/classes`, { name }); },
    renameClass: async (o, c, name) => { await call('PATCH', `/orgs/${o}/classes/${c}`, { name }); },
    deleteClass: async (o, c) => { await call('DELETE', `/orgs/${o}/classes/${c}`); },
    setClassTeacher: async (o, c, u, on) => {
      await (on ? call('PUT', `/orgs/${o}/classes/${c}/teachers`, { userId: u }) : call('DELETE', `/orgs/${o}/classes/${c}/teachers/${u}`));
    },
    setClassStudent: async (o, c, p, on) => {
      await (on ? call('PUT', `/orgs/${o}/classes/${c}/students`, { profileId: p }) : call('DELETE', `/orgs/${o}/classes/${c}/students/${p}`));
    },
    orgStudents: async (o, f = {}) => {
      const qs = new URLSearchParams();
      if (f.q) qs.set('q', f.q);
      if (f.classId) qs.set('groupId', f.classId);
      if (f.status) qs.set('status', f.status);
      return (await call<{ students: never[] }>('GET', `/orgs/${o}/students${qs.size ? `?${qs}` : ''}`)).students;
    },
    importStudents: (o, text, dryRun, options) => call('POST', `/orgs/${o}/students/import`, { text, dryRun, ...options }),
    createStudent: async (o, input, classIds, confirmDuplicate) => {
      try {
        const r = await call<{ student: never }>('POST', `/orgs/${o}/students`, { ...input, guardianConsent: input.guardianConsent ?? true, groupIds: classIds, confirmDuplicate });
        return { student: r.student };
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.code === 'duplicate') return { duplicates: (e.data as { duplicates: never[] }).duplicates };
        throw e;
      }
    },
    updateStudent: async (o, id, patch) => (await call<{ student: never }>('PATCH', `/orgs/${o}/students/${id}`, patch)).student,
    leaveStudent: async (o, id) => (await call<{ student: never }>('POST', `/orgs/${o}/students/${id}/leave`, {})).student,
    restoreStudent: async (o, id) => (await call<{ student: never }>('POST', `/orgs/${o}/students/${id}/restore`, {})).student,
    deleteStudent: async (o, id) => { await call('DELETE', `/orgs/${o}/students/${id}`); },
    studentPhoneCode: (o, id) => call('POST', `/orgs/${o}/students/${id}/phone-code`, {}),
    verifyStudentPhone: async (o, id, code) => { await call('POST', `/orgs/${o}/students/${id}/phone-verify`, { code }); },
    studentLinkCode: (o, id) => call('POST', `/orgs/${o}/students/${id}/link-code`, {}),
    unlinkStudent: async (o, id) => { await call('POST', `/orgs/${o}/students/${id}/unlink`, {}); },
    studentSummary: (o, id) => call('GET', `/orgs/${o}/students/${id}/summary`),
    setStudentElite: async (o, id, elite) => (await call<{ student: Student }>('PUT', `/orgs/${o}/students/${id}/elite`, { elite })).student,
    studentValidation: (o, id) => call('GET', `/orgs/${o}/students/${id}/validation`),
    bulkValidation: (o, body) => call('POST', `/orgs/${o}/validation/bulk`, body),
    inviteToOrg: (o, input) => call('POST', `/orgs/${o}/invitations`, input),
    orgInvitations: async (o) => (await call<{ items: never[] }>('GET', `/orgs/${o}/invitations`)).items,
    revokeOrgInvitation: async (o, id) => { await call('DELETE', `/orgs/${o}/invitations/${id}`); },
    orgTrash: async (o) => (await call<{ items: never[] }>('GET', `/orgs/${o}/trash`)).items,
    restoreOrgTrash: async (o, id) => { await call('POST', `/orgs/${o}/trash/${id}/restore`, {}); },
    adminTrash: async () => (await call<{ items: never[] }>('GET', '/admin/trash')).items,
    restoreAdminTrash: async (id) => { await call('POST', `/admin/trash/${id}/restore`, {}); },
    purgeAdminTrash: async (id) => { await call('DELETE', `/admin/trash/${id}`); },
    putValidation: (o, id, body) => call('PUT', `/orgs/${o}/students/${id}/validation`, body),
    ranking: (o, f) => call('GET', `/orgs/${o}/reports/ranking?period=${f.period}${f.classId ? `&groupId=${f.classId}` : ''}`),
    rhythm: async (o, id, weeks = 12) => (await call<{ weeks: never[] }>('GET', `/orgs/${o}/students/${id}/rhythm?weeks=${weeks}`)).weeks,
    studentResults: (o, id) => call('GET', `/orgs/${o}/students/${id}/results`),
    addAssessment: async (o, id, a) => { await call('POST', `/orgs/${o}/students/${id}/assessments`, a); },
    deleteAssessment: async (o, aid) => { await call('DELETE', `/orgs/${o}/assessments/${aid}`); },
    uploadCertificate: async (o, id, c) => {
      const bytes = new Uint8Array(await c.file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await call('POST', `/orgs/${o}/students/${id}/certificates`, { title: c.title, issuedOn: c.issuedOn, assessmentId: c.assessmentId, fileName: c.file.name, dataBase64: btoa(bin) });
    },
    deleteCertificate: async (o, cid) => { await call('DELETE', `/orgs/${o}/certificates/${cid}`); },
    certificateLink: async (o, cid) => (await call<{ url: string }>('GET', `/orgs/${o}/certificates/${cid}/link`)).url,
    addReward: async (o, id, r) => { await call('POST', `/orgs/${o}/students/${id}/rewards`, r); },
    setGiftGiven: async (o, rid, given) => { await call('PATCH', `/orgs/${o}/rewards/${rid}`, { given }); },
    deleteReward: async (o, rid) => { await call('DELETE', `/orgs/${o}/rewards/${rid}`); },
  };
}
