class Surah {
  final int number;
  final String name;
  final List<String> ayahs;
  const Surah(this.number, this.name, this.ayahs);
  int get ayahCount => ayahs.length;
}

class Reciter {
  final String id;
  final String name;
  final String source;
  final String audioTemplate;
  final Set<int> surahs;
  const Reciter(this.id, this.name, this.source, this.audioTemplate, this.surahs);

  factory Reciter.fromJson(Map<String, dynamic> j) => Reciter(
        j['id'] as String,
        j['name'] as String,
        j['source'] as String,
        j['audio'] as String,
        (j['surahs'] as List).cast<int>().toSet(),
      );

  bool hasSurah(int s) => surahs.contains(s);

  Uri audioUri(int surah) =>
      Uri.parse(audioTemplate.replaceAll('{surah:03d}', surah.toString().padLeft(3, '0')));
}

class AyahTiming {
  final int ayah;
  final int startMs;
  final int endMs;
  const AyahTiming(this.ayah, this.startMs, this.endMs);
}

enum AyahStatus {
  learning,
  memorized;

  static AyahStatus parse(String s) => s == 'memorized' ? memorized : learning;
}

class AyahProgress {
  final int surah;
  final int ayah;
  final AyahStatus status;
  final DateTime? memorizedAt;
  final DateTime? lastReviewedAt;
  final int reviewCount;

  /// Marqué « à revoir » par l'utilisateur (colorisation par niveau de maîtrise).
  final bool needsReview;
  final DateTime updatedAt;

  const AyahProgress({
    required this.surah,
    required this.ayah,
    required this.status,
    this.memorizedAt,
    this.lastReviewedAt,
    this.reviewCount = 0,
    this.needsReview = false,
    required this.updatedAt,
  });

  String get key => '$surah:$ayah';

  /// À réviser : appris, jamais révisé depuis 3 jours, ou révisé il y a plus de 7 jours.
  bool isDue([DateTime? now]) {
    if (status != AyahStatus.memorized) return false;
    final ref = lastReviewedAt ?? memorizedAt ?? updatedAt;
    return (now ?? DateTime.now()).difference(ref).inDays >= (lastReviewedAt == null ? 3 : 7);
  }

  AyahProgress copyWith({
    AyahStatus? status,
    DateTime? memorizedAt,
    DateTime? lastReviewedAt,
    int? reviewCount,
    bool? needsReview,
    DateTime? updatedAt,
  }) =>
      AyahProgress(
        surah: surah,
        ayah: ayah,
        status: status ?? this.status,
        memorizedAt: memorizedAt ?? this.memorizedAt,
        lastReviewedAt: lastReviewedAt ?? this.lastReviewedAt,
        reviewCount: reviewCount ?? this.reviewCount,
        needsReview: needsReview ?? this.needsReview,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  /// Format de l'API (et du stockage local).
  Map<String, dynamic> toJson() => {
        'surah': surah,
        'ayah': ayah,
        'status': status.name,
        'memorizedAt': memorizedAt?.toUtc().toIso8601String(),
        'lastReviewedAt': lastReviewedAt?.toUtc().toIso8601String(),
        'reviewCount': reviewCount,
        'needsReview': needsReview,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
      };

  factory AyahProgress.fromJson(Map<String, dynamic> j) => AyahProgress(
        surah: (j['surah'] as num).toInt(),
        ayah: (j['ayah'] as num).toInt(),
        status: AyahStatus.parse(j['status'] as String),
        memorizedAt: _date(j['memorizedAt']),
        lastReviewedAt: _date(j['lastReviewedAt']),
        reviewCount: (j['reviewCount'] as num?)?.toInt() ?? 0,
        needsReview: j['needsReview'] == true,
        updatedAt: _date(j['updatedAt']) ?? DateTime.now(),
      );

  static DateTime? _date(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();
}

DateTime? _d(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

/// Utilisateur connecté.
class AppUser {
  final String id;
  final String email;
  final String displayName;
  final String role; // user | admin
  const AppUser(this.id, this.email, this.displayName, this.role);
  bool get isAdmin => role == 'admin';
  factory AppUser.fromJson(Map<String, dynamic> j) =>
      AppUser(j['id'] as String, j['email'] as String, (j['displayName'] as String?) ?? '', j['role'] as String);
  Map<String, dynamic> toJson() => {'id': id, 'email': email, 'displayName': displayName, 'role': role};
}

/// Groupe dont je fais partie.
class MyGroup {
  final String id;
  final String name;
  final String role; // admin | member
  final int members;
  const MyGroup(this.id, this.name, this.role, this.members);
  bool get isGroupAdmin => role == 'admin';
  factory MyGroup.fromJson(Map<String, dynamic> j) =>
      MyGroup(j['id'] as String, j['name'] as String, j['role'] as String, (j['members'] as num).toInt());
}

/// Statistiques d'un utilisateur (liste admin ou membres d'un groupe).
class UserStats {
  final String id;
  final String email;
  final String displayName;
  final String role;
  final String status;
  final String? groupRole;
  final int memorized;
  final int learning;
  final DateTime? lastActivity;
  final DateTime? lastLoginAt;
  const UserStats({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.status,
    this.groupRole,
    required this.memorized,
    required this.learning,
    this.lastActivity,
    this.lastLoginAt,
  });
  bool get isAdmin => role == 'admin';
  bool get active => status == 'active';
  String get name => displayName.trim().isEmpty ? email : displayName;
  factory UserStats.fromJson(Map<String, dynamic> j) => UserStats(
        id: j['id'] as String,
        email: j['email'] as String,
        displayName: (j['displayName'] as String?) ?? '',
        role: j['role'] as String,
        status: j['status'] as String,
        groupRole: j['groupRole'] as String?,
        memorized: (j['memorized'] as num).toInt(),
        learning: (j['learning'] as num).toInt(),
        lastActivity: _d(j['lastActivity']),
        lastLoginAt: _d(j['lastLoginAt']),
      );
}

class Invitation {
  final String id;
  final String email;
  final String role;
  final String? groupName;
  final String groupRole;
  final String state; // pending | accepted | revoked | expired
  final DateTime expiresAt;
  final DateTime createdAt;
  const Invitation(this.id, this.email, this.role, this.groupName, this.groupRole, this.state, this.expiresAt, this.createdAt);
  factory Invitation.fromJson(Map<String, dynamic> j) => Invitation(
        j['id'] as String,
        j['email'] as String,
        j['role'] as String,
        j['groupName'] as String?,
        (j['groupRole'] as String?) ?? 'member',
        j['state'] as String,
        _d(j['expiresAt'])!,
        _d(j['createdAt'])!,
      );
}

/// Résultat de création d'une invitation (le code n'est visible qu'une fois).
class CreatedInvitation {
  final String email;
  final String code;
  final String? link;
  final String message;

  /// Sujet de l'e-mail (adapté au rôle invité).
  final String? subject;

  /// L'e-mail est parti automatiquement depuis le serveur.
  final bool emailed;
  const CreatedInvitation(this.email, this.code, this.link, this.message, {this.subject, this.emailed = false});
}

class GroupSummary {
  final String id;
  final String name;
  final int members;
  final int managers;
  const GroupSummary(this.id, this.name, this.members, this.managers);
  factory GroupSummary.fromJson(Map<String, dynamic> j) => GroupSummary(
      j['id'] as String, j['name'] as String, (j['members'] as num).toInt(), (j['managers'] as num).toInt());
}

class AdminStats {
  final int users, admins, memorizedTotal, active7Days, pendingInvitations, groups;
  const AdminStats(this.users, this.admins, this.memorizedTotal, this.active7Days, this.pendingInvitations, this.groups);
  factory AdminStats.fromJson(Map<String, dynamic> j) {
    int n(String k) => (j[k] as num).toInt();
    return AdminStats(n('users'), n('admins'), n('memorizedTotal'), n('active7Days'), n('pendingInvitations'), n('groups'));
  }
}

/// Résultat d'un ajout par e-mail dans un groupe : membre ajouté, ou invitation créée.
class AddMemberResult {
  final bool added;
  final String email;
  final String? code;
  final String? message;
  final String? subject;
  final bool emailed;
  const AddMemberResult({required this.added, required this.email, this.code, this.message, this.subject, this.emailed = false});
}

/// Niveau de maîtrise d'un ayah, pour la colorisation « par niveau de maîtrise ».
enum Mastery {
  /// Pas suivi.
  none,

  /// En cours d'apprentissage.
  learning,

  /// Marqué « à revoir », ou révision en retard.
  review,

  /// Appris.
  acquired;

  /// Ordre du cycle au toucher : non appris → en cours → acquis → à revoir → non appris.
  Mastery get next => switch (this) {
        none => learning,
        learning => acquired,
        acquired => review,
        review => none,
      };
}
