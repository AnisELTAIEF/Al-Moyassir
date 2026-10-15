import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/duas.dart';
import 'package:hifidh_quran/core/models.dart';
import 'package:hifidh_quran/core/settings.dart';
import 'package:hifidh_quran/screens/review_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

AyahProgress ap(int s, int a, {DateTime? memorizedAt, DateTime? reviewed}) => AyahProgress(
    surah: s, ayah: a, status: AyahStatus.memorized, memorizedAt: memorizedAt, lastReviewedAt: reviewed, updatedAt: DateTime(2026, 10, 1));

void main() {
  test('révision : ayat consécutifs regroupés en passages, par sourate', () {
    final g = groupPassages([ap(2, 3), ap(1, 2), ap(2, 1), ap(1, 1), ap(2, 2), ap(2, 7)]);
    expect([for (final p in g) '${p.surah}:${p.from}-${p.to}'], ['1:1-2', '2:1-3', '2:7-7']);
  });

  test('révision : 3 jours après l’apprentissage, puis 7 jours après chaque révision', () {
    expect(nextReviewOf(ap(1, 1, memorizedAt: DateTime(2026, 10, 1))), DateTime(2026, 10, 4));
    expect(nextReviewOf(ap(1, 1, memorizedAt: DateTime(2026, 10, 1), reviewed: DateTime(2026, 10, 5))), DateTime(2026, 10, 12));
  });

  test('invocation du jour : au prénom, sinon forme « nous » ; change chaque jour', () {
    expect(firstName('Anis ELTAIEF'), 'Anis');
    expect(firstName('  '), isNull);
    final day = DateTime(2026, 10, 15);
    final named = duaOfDay(day, 'Anis');
    expect(named.ar, contains('Anis'));
    expect(named.fr, contains('Anis'));
    expect(duaOfDay(day, null).ar, isNot(contains('{name}')));
    expect(duaOfDay(day, 'Anis').ar, isNot(duaOfDay(day.add(const Duration(days: 1)), 'Anis').ar));
  });

  test('dernière activité : mémorisée par compte', () async {
    SharedPreferences.setMockInitialValues({});
    final s = Settings(await SharedPreferences.getInstance());
    expect(s.lastActivity, isNull);
    s.saveActivity(Activity.qiraa, 2, 200);
    expect(s.lastActivity!.kind, Activity.qiraa);
    expect((s.lastActivity!.surah, s.lastActivity!.ayah), (2, 200));
    s.owner = 'u2';
    expect(s.lastActivity, isNull, reason: 'un autre compte a sa propre activité');
  });
}
