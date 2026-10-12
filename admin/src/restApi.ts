import type { Api, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
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
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Erreur ${res.status}`);
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
    users: async () => items(await call('GET', '/admin/users')),
    updateUser: async (id, patch) => { await call('PATCH', `/admin/users/${id}`, patch); },
    deleteUser: async (id) => { await call('DELETE', `/admin/users/${id}`); },
    userProgress: async (id) => items(await call('GET', `/admin/users/${id}/progress`)),
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
    groupInvitations: async (g) => items(await call('GET', `/groups/${g}/invitations`)),
    revokeGroupInvitation: async (g, i) => { await call('DELETE', `/groups/${g}/invitations/${i}`); },
    groupMembers: async (g) => (await call<{ members: never[] }>('GET', `/groups/${g}/overview`)).members,
    groupJoinCode: async (g) => (await call<{ group: { joinCode?: string | null } }>('GET', `/groups/${g}/overview`)).group.joinCode ?? null,
    regenerateJoinCode: async (g) => (await call<{ joinCode: string }>('POST', `/groups/${g}/join-code`)).joinCode,
    memberProgress: async (g, u) => items(await call('GET', `/groups/${g}/members/${u}/progress`)),
  };
}
