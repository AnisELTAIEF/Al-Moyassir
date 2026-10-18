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
  /** Nom indiqué à l'invitation (import). */
  displayName?: string | null;
  /** Date d'envoi réussi de l'e-mail d'invitation. */
  emailedAt?: string | null;
}

/** Une ligne du résultat d'import. */
export interface ImportItem {
  line: number; email: string | null; name: string | null; group: string | null; role: 'admin' | 'member' | null;
  action: 'added' | 'updated' | 'invited' | 'unchanged' | 'error';
  message: string; text?: string; code?: string; link?: string | null;
}
export interface ImportResult {
  dryRun: boolean;
  summary: { added: number; updated: number; invited: number; unchanged: number; errors: number; groupsCreated: string[] };
  /** E-mails d'invitation en cours d'envoi (arrière-plan). */
  emailing: number;
  mailConfigured: boolean;
  items: ImportItem[];
}
export interface CreatedInvitation {
  email: string; code: string; link: string | null; message: string; expiresAt: string;
  /** Sujet de l'e-mail (adapté au rôle invité). */
  subject?: string;
  /** L'e-mail est parti automatiquement (envoi SMTP configuré sur le serveur). */
  emailed?: boolean;
  /** L'envoi automatique est configuré sur le serveur. */
  mailConfigured?: boolean;
}
export interface PasswordReset { code: string; message: string; expiresAt: string }

export interface GroupSummary { id: string; name: string; members: number; managers: number; joinCode?: string | null; joinOpen?: boolean }
export interface UserGroupRef { id: string; name: string; role: 'admin' | 'member' }
export interface MyGroup { id: string; name: string; role: 'admin' | 'member'; members: number }
export type AddMemberResult = { added: true; email: string } | ({ invited: true } & CreatedInvitation);

export interface Stats {
  users: number; admins: number; activeUsers: number; memorizedTotal: number; learners: number;
  active7Days: number; pendingInvitations: number; groups: number;
}

// ───── Établissements (association / mosquée), classes, équipe, élèves ─────
export type OrgRole = 'admin' | 'teacher' | 'student';
export type OrgType = 'association' | 'mosque';
export interface OrgSummary {
  id: string; name: string; type: OrgType; address: string; errorThreshold: number;
  roles: OrgRole[]; studentCount: number; classCount: number;
}
export interface OrgClass { id: string; name: string; studentCount: number; teachers: { userId: string; displayName: string }[] }
export interface OrgMember { userId: string; email: string; displayName: string; roles: OrgRole[] }
export interface Student {
  id: string; organizationId: string; fullName: string; fatherName: string; birthDate: string | null; age: number | null;
  gender: 'm' | 'f' | null; phone: string | null; phoneVerified: boolean; joinedAt: string | null; hifdhStartedAt: string | null;
  pastCompetitions: string; guardianConsentAt: string | null; status: 'active' | 'left'; leftAt: string | null;
  retainUntil: string | null; linked: boolean; classes: { id: string; name: string }[]; createdAt: string;
}
export interface StudentInput {
  fullName: string; fatherName?: string; birthDate?: string | null; gender?: 'm' | 'f' | null; phone?: string | null;
  joinedAt?: string | null; hifdhStartedAt?: string | null; pastCompetitions?: string | null;
}
export interface DuplicateStudent { id: string; fullName: string; fatherName: string; status: 'active' | 'left' }
/** Mémorisation VALIDÉE par l'enseignant (jamais l'auto-marquage de l'élève) : global et successif en unités entières. */
export interface UnitStats { complete: number; longestRun: number }
export interface StudentSummary {
  stats: { ayat: number; surahs: UnitStats; ahzab: UnitStats };
  retakePages: number[]; threshold: number; validatedAyat: number;
}
export type CreateStudentResult = { student: Student } | { duplicates: DuplicateStudent[] };

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
  /** Import général (admins globaux) : « Groupe ; Nom ; e-mail ; rôle ». dryRun = simulation. */
  importUsers(text: string, dryRun: boolean): Promise<ImportResult>;
  /** Import dans un groupe : « Nom ; e-mail ». */
  importToGroup(groupId: string, text: string, dryRun: boolean): Promise<ImportResult>;

  // ───── Établissements ─────
  /** Établissements où l'utilisateur a un rôle (tous pour un admin global). */
  myOrgs(): Promise<OrgSummary[]>;
  createOrg(input: { name: string; type: OrgType; address: string; adminEmail?: string }): Promise<OrgSummary>;
  updateOrg(id: string, patch: Partial<{ name: string; type: OrgType; address: string; errorThreshold: number }>): Promise<OrgSummary>;
  orgMembers(orgId: string): Promise<OrgMember[]>;
  addOrgMember(orgId: string, email: string, role: OrgRole): Promise<void>;
  removeOrgMember(orgId: string, userId: string, role?: OrgRole): Promise<void>;
  orgClasses(orgId: string): Promise<OrgClass[]>;
  createClass(orgId: string, name: string): Promise<void>;
  renameClass(orgId: string, classId: string, name: string): Promise<void>;
  deleteClass(orgId: string, classId: string): Promise<void>;
  setClassTeacher(orgId: string, classId: string, userId: string, on: boolean): Promise<void>;
  setClassStudent(orgId: string, classId: string, profileId: string, on: boolean): Promise<void>;
  orgStudents(orgId: string, filter?: { q?: string; classId?: string; status?: 'active' | 'left' | 'all' }): Promise<Student[]>;
  /** Consentement des parents obligatoire. Renvoie `duplicates` si un élève porte déjà ce nom + prénom du père (à confirmer). */
  createStudent(orgId: string, input: StudentInput, classIds: string[], confirmDuplicate: boolean): Promise<CreateStudentResult>;
  updateStudent(orgId: string, id: string, patch: Partial<StudentInput>): Promise<Student>;
  leaveStudent(orgId: string, id: string): Promise<Student>;
  restoreStudent(orgId: string, id: string): Promise<Student>;
  deleteStudent(orgId: string, id: string): Promise<void>;
  /** Code à usage unique à transmettre à l'élève (par WhatsApp) pour vérifier son numéro. */
  studentPhoneCode(orgId: string, id: string): Promise<{ code: string; phone: string; expiresAt: string }>;
  verifyStudentPhone(orgId: string, id: string, code: string): Promise<void>;
  /** Code de liaison à remettre au parent pour rattacher le compte de l'enfant à sa fiche. */
  studentLinkCode(orgId: string, id: string): Promise<{ code: string; expiresAt: string }>;
  unlinkStudent(orgId: string, id: string): Promise<void>;
  /** حفظ إجمالي / مسترسل en ahzab et sourates entiers, d'après les validations de l'enseignant. */
  studentSummary(orgId: string, id: string): Promise<StudentSummary>;
}
