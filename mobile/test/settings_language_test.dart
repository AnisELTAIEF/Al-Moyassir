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

  test('validation de l’enseignant : choix explicite de l’élève détecté, activation unique par compte', () async {
    final s = await _settings({});
    expect(s.hasColoringChoice(ReadingMode.mushaf), isFalse, reason: 'rien choisi : la valeur par défaut s’applique');
    expect(s.validationIntroduced, isFalse);

    s.setColoringIn(ReadingMode.mushaf, AyahColoring.perAyah);
    expect(s.hasColoringChoice(ReadingMode.mushaf), isTrue, reason: 'son choix ne doit pas être écrasé');
    expect(s.hasColoringChoice(ReadingMode.ayah), isFalse, reason: 'réglage propre à chaque mode');

    s.validationIntroduced = true;
    expect(s.validationIntroduced, isTrue);
    s.owner = 'autre-compte';
    expect(s.validationIntroduced, isFalse, reason: 'l’information est propre à chaque compte');
    expect(s.hasColoringChoice(ReadingMode.mushaf), isFalse, reason: 'choix de colorisation propre à chaque compte');
  });

  test('« Votre khatma » : 114 sourates par défaut, 604 pages au choix, propre à chaque compte', () async {
    final s = await _settings({});
    expect(s.khatmaByPage, isFalse);
    s.khatmaByPage = true;
    expect(s.khatmaByPage, isTrue);
    s.owner = 'autre-compte';
    expect(s.khatmaByPage, isFalse);
  });

  test('rythme de la khatma : valeurs par défaut, mémorisé par compte', () async {
    final s = await _settings({});
    expect(s.hasKhatmaPlan, isFalse);
    expect([s.khatmaDays, s.khatmaMinutes, s.khatmaPace, s.khatmaReview], [5, 30, 'medium', 30]);
    s.saveKhatmaPlan(days: 3, minutes: 45, pace: 'fast', review: 20);
    expect(s.hasKhatmaPlan, isTrue);
    expect([s.khatmaDays, s.khatmaMinutes, s.khatmaPace, s.khatmaReview], [3, 45, 'fast', 20]);
    s.owner = 'autre-compte';
    expect(s.hasKhatmaPlan, isFalse);
  });
}
