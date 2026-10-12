import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('jeton expiré : renouvellement automatique puis nouvelle tentative', () async {
    var refreshCalls = 0;
    String? savedRefresh;
    final mock = MockClient((req) async {
      if (req.url.path == '/auth/refresh') {
        refreshCalls++;
        expect(jsonDecode(req.body)['refreshToken'], 'r1');
        return http.Response(jsonEncode({'accessToken': 'a2', 'refreshToken': 'r2', 'expiresIn': 900}), 200);
      }
      if (req.headers['Authorization'] == 'Bearer a2') return http.Response(jsonEncode({'ok': true}), 200);
      return http.Response(jsonEncode({'error': 'invalid_token', 'message': 'Session expirée.'}), 401);
    });
    final api = ApiClient('https://x.test', client: mock)
      ..accessToken = 'a1'
      ..refreshToken = 'r1'
      ..onRefreshTokenChanged = (t) => savedRefresh = t;
    final r = await api.get('/me');
    expect(r['ok'], true);
    expect(refreshCalls, 1);
    expect(savedRefresh, 'r2');
  });

  test('refresh refusé : session perdue', () async {
    var lost = false;
    final mock = MockClient((req) async {
      if (req.url.path == '/auth/refresh') return http.Response(jsonEncode({'error': 'invalid_refresh', 'message': 'x'}), 401);
      return http.Response(jsonEncode({'error': 'invalid_token', 'message': 'x'}), 401);
    });
    final api = ApiClient('https://x.test', client: mock)
      ..accessToken = 'a1'
      ..refreshToken = 'r1'
      ..onSessionLost = () => lost = true;
    await expectLater(api.get('/me'), throwsA(isA<ApiException>()));
    expect(lost, true);
    expect(api.refreshToken, isNull);
  });

  test('message d’erreur du serveur transmis tel quel', () async {
    // Corps en UTF-8 sans charset déclaré : doit quand même être bien décodé.
    final api = ApiClient('https://x.test', client: MockClient((_) async => http.Response.bytes(
        utf8.encode(jsonEncode({'error': 'invitation_required', 'message': 'Ce compte n’a pas été invité.'})), 403,
        headers: {'content-type': 'application/json'})));
    try {
      await api.public('POST', '/auth/google', {'idToken': 'x'});
      fail('doit échouer');
    } on ApiException catch (e) {
      expect(e.status, 403);
      expect(e.code, 'invitation_required');
      expect(e.message, 'Ce compte n’a pas été invité.');
    }
  });
}
