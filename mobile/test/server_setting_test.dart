import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('adresse du serveur : enregistrée, nettoyée, et mode local si vide', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final auth = AuthService(prefs);
    expect(auth.enabled, isFalse, reason: 'sans adresse : mode local');
    await auth.setServer('  https://quran.exemple.com/api/  ');
    expect(auth.serverUrl, 'https://quran.exemple.com/api');
    expect(auth.enabled, isTrue);
    expect(AuthService(prefs).enabled, isTrue, reason: 'conservée au redémarrage');
    await auth.setServer('');
    expect(auth.enabled, isFalse);
  });
}
