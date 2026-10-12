import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../env.dart';
import 'api_client.dart';
import 'models.dart';
import 'i18n.dart';

/// Session de l'utilisateur : connexion Google ou mot de passe, invitations, déconnexion.
/// Le refresh token est conservé dans le stockage sécurisé du téléphone (Keychain / Keystore).
class AuthService extends ChangeNotifier {
  AuthService(this._prefs, {FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage() {
    _prefs.remove('api_url'); // adresse saisie à la main dans les versions ≤ 0.9 : remplacée par l'adresse figée
    _connect(serverUrl);
  }

  final SharedPreferences _prefs;

  /// Adresse de l'API : figée dans l'app ([Env.apiUrl]). Une adresse saisie dans une ancienne
  /// version (clé `api_url`) n'est plus utilisée ; [setServer] ne sert qu'aux tests.
  String get serverUrl => _override ?? Env.apiUrl;
  String? _override;

  void _connect(String url) {
    api = url.trim().isEmpty
        ? null
        : (ApiClient(url.trim())
          ..onRefreshTokenChanged = _saveRefresh
          ..onSessionLost = _clearLocal);
  }

  /// Change de serveur (déconnecte la session en cours). Chaîne vide = mode local.
  Future<void> setServer(String url) async {
    if (signedIn) await signOut();
    final clean = url.trim().replaceAll(RegExp(r'/+$'), '');
    _override = clean;
    _connect(clean);
    notifyListeners();
  }

  /// Vérifie qu'un serveur répond (GET /health).
  static Future<bool> ping(String url) async {
    try {
      final r = await ApiClient(url.trim().replaceAll(RegExp(r'/+$'), '')).public('GET', '/health');
      return r is Map && r['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  /// Pas sur la version web : google_sign_in y exige un bouton propre à Google (non intégré).
  bool get googleEnabled => !kIsWeb && api != null && Env.googleServerClientId.isNotEmpty;

  void _saveRefresh(String? t) {
    if (t == null) {
      _storage.delete(key: _kRefresh);
    } else {
      _storage.write(key: _kRefresh, value: t);
    }
  }

  static const _kRefresh = 'refresh_token';
  static const _kUser = 'user_json';
  final FlutterSecureStorage _storage;
  ApiClient? api;
  AppUser? user;
  List<MyGroup> groups = const [];
  bool _googleReady = false;

  bool get enabled => api != null;
  bool get signedIn => user != null;
  String? get userId => user?.id;
  bool get isAdmin => user?.isAdmin ?? false;
  bool get managesGroups => groups.any((g) => g.isGroupAdmin);

  /// Peut ouvrir l'onglet « Suivi » (admins globaux et admins de groupe).
  bool get canSupervise => isAdmin || managesGroups;

  Future<void> loadGroups() async {
    if (!signedIn) return;
    try {
      groups = await myGroups();
      notifyListeners();
    } catch (_) {/* hors ligne */}
  }

  /// Au démarrage : reprend la session enregistrée (fonctionne aussi hors ligne).
  Future<void> restore() async {
    if (api == null) return;
    final rt = await _storage.read(key: _kRefresh);
    final cached = await _storage.read(key: _kUser);
    if (rt == null) return;
    api!.refreshToken = rt;
    if (cached != null) user = AppUser.fromJson(jsonDecode(cached) as Map<String, dynamic>);
    notifyListeners();
    try {
      await refreshProfile();
    } on ApiException catch (e) {
      if (!e.isNetwork) await _clearLocal();
    }
  }

  Future<void> refreshProfile() async {
    final me = await api!.get('/me') as Map<String, dynamic>;
    user = AppUser.fromJson(me);
    await _storage.write(key: _kUser, value: jsonEncode(user!.toJson()));
    notifyListeners();
    await loadGroups();
  }

  Future<void> _applySession(Map<String, dynamic> s) async {
    api!
      ..accessToken = s['accessToken'] as String
      ..refreshToken = s['refreshToken'] as String;
    user = AppUser.fromJson(s['user'] as Map<String, dynamic>);
    await _storage.write(key: _kRefresh, value: api!.refreshToken);
    await _storage.write(key: _kUser, value: jsonEncode(user!.toJson()));
    notifyListeners();
    await loadGroups();
  }

  Future<void> signInWithPassword(String email, String password) async {
    await _applySession(await api!.public('POST', '/auth/login', {'email': email, 'password': password}) as Map<String, dynamic>);
  }

  /// [code] : code d'invitation (8 caractères, l'e-mail vient alors de l'invitation) ou code de groupe (6).
  Future<void> register({String? email, required String password, required String displayName, String? code}) async {
    await _applySession(await api!.public('POST', '/auth/register', {
      if (email != null && email.isNotEmpty) 'email': email,
      'password': password,
      'displayName': displayName,
      if (code != null && code.isNotEmpty) 'invitationCode': code,
    }) as Map<String, dynamic>);
  }

  /// Connexion Google. Renvoie false si l'utilisateur a annulé.
  Future<bool> signInWithGoogle({String? invitationCode}) async {
    if (!googleEnabled) throw ApiException(0, 'google_not_configured', tr('La connexion Google n’est pas configurée dans cette version.'));
    if (!_googleReady) {
      await GoogleSignIn.instance.initialize(
        serverClientId: Env.googleServerClientId,
        clientId: Env.googleIosClientId.isEmpty ? null : Env.googleIosClientId,
      );
      _googleReady = true;
    }
    final GoogleSignInAccount account;
    try {
      account = await GoogleSignIn.instance.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return false;
      throw ApiException(0, 'google_failed', tr('La connexion Google a échoué.'));
    }
    final idToken = account.authentication.idToken;
    if (idToken == null) throw ApiException(0, 'google_failed', tr('Google n’a pas fourni d’identité.'));
    try {
      await _applySession(await api!.public('POST', '/auth/google', {
        'idToken': idToken,
        if (invitationCode != null && invitationCode.isNotEmpty) 'invitationCode': invitationCode,
      }) as Map<String, dynamic>);
    } on ApiException {
      await GoogleSignIn.instance.signOut();
      rethrow;
    }
    return true;
  }

  /// Aperçu d'une invitation (email invité, groupe…).
  /// Aperçu d'un code : `{type: 'invitation', email, groupName…}` ou `{type: 'group', groupName}`.
  Future<Map<String, dynamic>> previewCode(String code) async =>
      await api!.public('GET', '/auth/codes/${Uri.encodeComponent(code.trim())}') as Map<String, dynamic>;

  /// Rejoint un groupe (code de groupe, ou code d'invitation adressé à ce compte), puis recharge mes groupes.
  Future<String> joinGroup(String code) async {
    final r = await api!.post('/me/groups/join', {'code': code.trim()}) as Map<String, dynamic>;
    await refreshProfile();
    return (r['group'] as Map<String, dynamic>)['name'] as String;
  }

  Future<void> updateName(String name) async {
    await api!.patch('/me', {'displayName': name});
    await refreshProfile();
  }

  Future<void> signOut() async {
    final rt = api?.refreshToken;
    if (rt != null) {
      try {
        await api!.public('POST', '/auth/logout', {'refreshToken': rt});
      } catch (_) {/* hors ligne : on déconnecte localement */}
    }
    if (_googleReady) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
    }
    await _clearLocal();
  }

  Future<void> _clearLocal() async {
    api?.accessToken = null;
    api?.refreshToken = null;
    user = null;
    groups = const [];
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kUser);
    notifyListeners();
  }

  // ── Progression et groupes de l'utilisateur ──
  Future<List<AyahProgress>> fetchProgress() async {
    final r = await api!.get('/me/progress') as Map<String, dynamic>;
    return [for (final j in r['items'] as List) AyahProgress.fromJson(j as Map<String, dynamic>)];
  }

  Future<void> upsertProgress(List<AyahProgress> items) => api!.put('/me/progress', {'items': [for (final p in items) p.toJson()]});

  Future<void> deleteProgress(List<(int, int)> keys) =>
      api!.post('/me/progress/delete', {'keys': [for (final k in keys) {'surah': k.$1, 'ayah': k.$2}]});

  Future<List<MyGroup>> myGroups() async {
    final r = await api!.get('/me/groups') as Map<String, dynamic>;
    return [for (final j in r['items'] as List) MyGroup.fromJson(j as Map<String, dynamic>)];
  }
}
