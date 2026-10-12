import 'api_client.dart';
import 'models.dart';

/// Appels d'administration et de suivi de groupe.
class AdminService {
  AdminService(this.api);
  final ApiClient api;

  List<T> _items<T>(dynamic r, T Function(Map<String, dynamic>) f) =>
      [for (final j in (r as Map<String, dynamic>)['items'] as List) f(j as Map<String, dynamic>)];

  Future<AdminStats> stats() async => AdminStats.fromJson(await api.get('/admin/stats') as Map<String, dynamic>);
  Future<List<UserStats>> users() async => _items(await api.get('/admin/users'), UserStats.fromJson);
  Future<List<AyahProgress>> userProgress(String id) async => _items(await api.get('/admin/users/$id/progress'), AyahProgress.fromJson);
  Future<void> updateUser(String id, {String? role, String? status}) =>
      api.patch('/admin/users/$id', {'role': ?role, 'status': ?status});
  Future<void> deleteUser(String id) => api.delete('/admin/users/$id');

  Future<List<Invitation>> invitations() async => _items(await api.get('/admin/invitations'), Invitation.fromJson);
  Future<CreatedInvitation> invite(String email, {String role = 'user', String? groupId, String groupRole = 'member'}) async {
    final r = await api.post('/admin/invitations', {'email': email, 'role': role, 'groupId': ?groupId, 'groupRole': groupRole}) as Map<String, dynamic>;
    return CreatedInvitation(r['email'] as String, r['code'] as String, r['link'] as String?, r['message'] as String);
  }
  Future<void> revokeInvitation(String id) => api.delete('/admin/invitations/$id');

  Future<List<GroupSummary>> groups() async => _items(await api.get('/admin/groups'), GroupSummary.fromJson);
  Future<void> createGroup(String name) => api.post('/admin/groups', {'name': name});
  Future<void> renameGroup(String id, String name) => api.patch('/groups/$id', {'name': name});
  Future<void> deleteGroup(String id) => api.delete('/admin/groups/$id');
  /// Ajoute un utilisateur existant par son identifiant (admins globaux).
  Future<void> addUserToGroup(String groupId, String userId, String role) => api.put('/admin/groups/$groupId/members/$userId', {'role': role});

  // Gestion d'un groupe : admins globaux et admins du groupe.
  Future<void> setGroupRole(String groupId, String userId, String role) => api.put('/groups/$groupId/members/$userId', {'role': role});
  Future<void> removeMember(String groupId, String userId) => api.delete('/groups/$groupId/members/$userId');
  Future<AddMemberResult> addMemberByEmail(String groupId, String email, String role) async {
    final r = await api.post('/groups/$groupId/members', {'email': email, 'role': role}) as Map<String, dynamic>;
    return AddMemberResult(
      added: r['added'] == true,
      email: (r['email'] ?? (r['user'] as Map?)?['email'] ?? email) as String,
      code: r['code'] as String?,
      message: r['message'] as String?,
    );
  }
  /// Code permanent du groupe (6 caractères) : à partager pour rejoindre le groupe sans invitation par e-mail.
  Future<String?> groupJoinCode(String groupId) async {
    final r = await api.get('/groups/$groupId/overview') as Map<String, dynamic>;
    return (r['group'] as Map<String, dynamic>)['joinCode'] as String?;
  }
  Future<String> regenerateJoinCode(String groupId) async =>
      ((await api.post('/groups/$groupId/join-code')) as Map<String, dynamic>)['joinCode'] as String;
  Future<List<Invitation>> groupInvitations(String groupId) async => _items(await api.get('/groups/$groupId/invitations'), Invitation.fromJson);
  Future<void> revokeGroupInvitation(String groupId, String invitationId) => api.delete('/groups/$groupId/invitations/$invitationId');

  // Suivi (admins globaux et admins de groupe)
  Future<List<UserStats>> groupMembers(String groupId) async {
    final r = await api.get('/groups/$groupId/overview') as Map<String, dynamic>;
    return [for (final j in r['members'] as List) UserStats.fromJson(j as Map<String, dynamic>)];
  }
  Future<List<AyahProgress>> memberProgress(String groupId, String userId) async =>
      _items(await api.get('/groups/$groupId/members/$userId/progress'), AyahProgress.fromJson);
}
