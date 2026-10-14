export type Role = 'user' | 'admin';

export interface User { id: string; email: string; displayName: string; role: Role }

export interface UserStats {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: 'active' | 'disabled';
  groupRole?: 'admin' | 'member';
  memorized: number;
  learning: number;
  lastActivity: string | null;
  lastLoginAt: string | null;
}

export interface AyahProgress {
  surah: number;
  ayah: number;
  status: 'learning' | 'memorized';
  memorizedAt: string | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  updatedAt: string;
}

export interface Invitation {
  id: string; email: string; role: Role; groupName: string | null; groupRole?: 'admin' | 'member';
  state: 'pending' | 'accepted' | 'revoked' | 'expired'; createdAt: string; expiresAt: string;
}
export interface CreatedInvitation { email: string; code: string; link: string | null; message: string; expiresAt: string }
export interface PasswordReset { code: string; message: string; expiresAt: string }

export interface GroupSummary { id: string; name: string; members: number; managers: number; joinCode?: string | null; joinOpen?: boolean }
export interface UserGroupRef { id: string; name: string; role: 'admin' | 'member' }
export interface MyGroup { id: string; name: string; role: 'admin' | 'member'; members: number }
export type AddMemberResult = { added: true; email: string } | ({ invited: true } & CreatedInvitation);

export interface Stats {
  users: number; admins: number; activeUsers: number; memorizedTotal: number; learners: number;
  active7Days: number; pendingInvitations: number; groups: number;
}

export interface Api {
  demo: boolean;
  googleClientId: string | null;
  restore(): Promise<User | null>;
  /** Ayat appris par jour (tendance), N derniers jours. */
  activity(days?: number): Promise<{ day: string; memorized: number }[]>;
  signIn(email: string, password: string): Promise<User>;
  signInWithGoogle(idToken: string): Promise<User>;
  signOut(): Promise<void>;
  myGroups(): Promise<MyGroup[]>;
  stats(): Promise<Stats>;
  users(): Promise<UserStats[]>;
  updateUser(id: string, patch: { role?: Role; status?: 'active' | 'disabled' }): Promise<void>;
  deleteUser(id: string): Promise<void>;
  /** Génère un code de réinitialisation du mot de passe à transmettre à la personne. */
  resetUserPassword(id: string): Promise<PasswordReset>;
  userProgress(id: string): Promise<AyahProgress[]>;
  /** Groupes d'un utilisateur (avec son rôle dans chacun), pour la fiche utilisateur. */
  userGroups(id: string): Promise<UserGroupRef[]>;
  invitations(): Promise<Invitation[]>;
  invite(email: string, role: Role, groupId: string | null, groupRole?: 'admin' | 'member'): Promise<CreatedInvitation>;
  revokeInvitation(id: string): Promise<void>;
  groups(): Promise<GroupSummary[]>;
  createGroup(name: string): Promise<void>;
  renameGroup(id: string, name: string): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  /** Admins globaux : ajoute un utilisateur existant par identifiant. */
  addUserToGroup(groupId: string, userId: string, role: 'admin' | 'member'): Promise<void>;
  /** Admins globaux et admins du groupe. */
  setGroupRole(groupId: string, userId: string, role: 'admin' | 'member'): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  addMemberByEmail(groupId: string, email: string, role: 'admin' | 'member'): Promise<AddMemberResult>;
  groupInvitations(groupId: string): Promise<Invitation[]>;
  revokeGroupInvitation(groupId: string, invitationId: string): Promise<void>;
  groupMembers(groupId: string): Promise<UserStats[]>;
  /** Code permanent du groupe (6 caractères) et son renouvellement. */
  groupJoinCode(groupId: string): Promise<string | null>;
  regenerateJoinCode(groupId: string): Promise<string>;
  /** L'adhésion avec le code du groupe est-elle autorisée ? (activée par défaut) */
  groupJoinOpen(groupId: string): Promise<boolean>;
  setGroupJoinOpen(groupId: string, open: boolean): Promise<void>;
  memberProgress(groupId: string, userId: string): Promise<AyahProgress[]>;
}
