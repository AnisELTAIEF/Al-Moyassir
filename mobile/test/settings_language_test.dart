import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/settings.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<Settings> _settings(Map<String, Object> initial) async {
  SharedPreferences.setMockInitialValues(initial);
  return Settings(await SharedPreferences.getInstance());
}

void main() {
  test('nouvelle installation : arabe par défaut, et le choix est mémorisé', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    expect(Settings(prefs).language, 'ar');
    expect(prefs.getString('language'), 'ar');
  });

  test('utilisateur déjà installé sans choix de langue : reste « selon le téléphone »', () async {
    // Les clés de SharedPreferences sont préfixées « flutter. » dans le simulateur de test.
    const used = <String, Object>{
      'flutter.last_read': '2:5',
      'flutter.font_size': 30.0,
      'flutter.theme_mode': 'dark',
      'flutter.reading_mode': 'mushaf',
    };
    for (final e in used.entries) {
      expect((await _settings({e.key: e.value})).language, 'system', reason: e.key);
    }
  });

  test('un choix explicite est respecté', () async {
    expect((await _settings({'flutter.language': 'fr'})).language, 'fr');
    expect((await _settings({'flutter.language': 'system'})).language, 'system');
  });
}
