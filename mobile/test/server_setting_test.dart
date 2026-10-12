import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/auth_service.dart';
import 'package:hifidh_quran/env.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('adresse du serveur figée : celle de l’app, même si une ancienne adresse était enregistrée', () async {
    SharedPreferences.setMockInitialValues({'flutter.api_url': 'quran.exemple.com/api'});
    final prefs = await SharedPreferences.getInstance();
    final auth = AuthService(prefs);
    expect(Env.apiUrl, 'https://quran.bestconsultingit.com/api');
    expect(auth.serverUrl, Env.apiUrl);
    expect(auth.enabled, isTrue);
  });
}
