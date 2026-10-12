import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'i18n.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code, this._message);
  final int status;
  final String code;
  final String _message;

  /// Message à afficher, traduit si la langue de l'interface est l'arabe (les messages du serveur sont en français).
  String get message => tr(_message);
  bool get isNetwork => status == 0;
  @override
  String toString() => message;
}

/// Client HTTP de l'API Hifidh. Gère le jeton d'accès et son renouvellement automatique.
class ApiClient {
  ApiClient(String baseUrl, {http.Client? client})
      : _base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl,
        _http = client ?? http.Client();

  final String _base;
  final http.Client _http;

  String? accessToken;
  String? refreshToken;

  /// Appelé quand les jetons changent (pour les enregistrer) ou que la session est perdue.
  void Function(String? refreshToken)? onRefreshTokenChanged;
  void Function()? onSessionLost;

  Future<void>? _refreshing;

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// Requête sans authentification (connexion, aperçu d'invitation).
  Future<dynamic> public(String method, String path, [Object? body]) => _send(method, path, body, false);

  Future<dynamic> _send(String method, String path, [Object? body, bool auth = true, bool retried = false]) async {
    if (auth && accessToken == null && refreshToken != null) await refresh();
    final req = http.Request(method, Uri.parse('$_base$path'));
    req.headers['Accept'] = 'application/json';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    if (auth && accessToken != null) req.headers['Authorization'] = 'Bearer $accessToken';
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 20)));
    } on TimeoutException {
      throw ApiException(0, 'network', tr('Le serveur ne répond pas. Vérifiez votre connexion.'));
    } catch (_) {
      throw ApiException(0, 'network', tr('Pas de connexion au serveur.'));
    }
    // Toujours décoder en UTF-8 (accents, arabe), même si l'en-tête ne précise pas le charset.
    final text = utf8.decode(res.bodyBytes, allowMalformed: true);
    final data = text.isEmpty ? null : _decode(text);
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final code = data is Map ? (data['error'] ?? 'error').toString() : 'error';
    final message = data is Map && data['message'] != null ? data['message'].toString() : tr('Erreur {code}', {'code': res.statusCode});
    if (auth && res.statusCode == 401 && code == 'invalid_token' && !retried && refreshToken != null) {
      accessToken = null;
      await refresh();
      return _send(method, path, body, auth, true);
    }
    throw ApiException(res.statusCode, code, message);
  }

  dynamic _decode(String s) {
    try {
      return jsonDecode(s);
    } catch (_) {
      return null;
    }
  }

  /// Renouvelle la session (un seul renouvellement à la fois).
  Future<void> refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<void> _doRefresh() async {
    final rt = refreshToken;
    if (rt == null) return;
    try {
      final r = await _send('POST', '/auth/refresh', {'refreshToken': rt}, false) as Map;
      accessToken = r['accessToken'] as String;
      refreshToken = r['refreshToken'] as String;
      onRefreshTokenChanged?.call(refreshToken);
    } on ApiException catch (e) {
      if (e.isNetwork) rethrow; // hors ligne : on garde la session
      accessToken = null;
      refreshToken = null;
      onRefreshTokenChanged?.call(null);
      onSessionLost?.call();
      rethrow;
    }
  }
}
