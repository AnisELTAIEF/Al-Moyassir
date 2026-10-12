import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/auth_service.dart';
import 'package:hifidh_quran/core/models.dart';
import 'package:hifidh_quran/core/progress_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late ProgressStore store;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    store = ProgressStore(prefs, AuthService(prefs)); // Backend non configuré : mode local
    await store.attach(null);
  });

  test('marquer appris, en cours, retirer', () async {
    await store.setStatus(1, 1, AyahStatus.memorized);
    await store.setStatus(1, 2, AyahStatus.learning);
    expect(store.memorizedCount, 1);
    expect(store.learningCount, 1);
    expect(store.get(1, 1)!.memorizedAt, isNotNull);
    expect(store.get(1, 2)!.memorizedAt, isNull);
    await store.setStatus(1, 1, null);
    expect(store.memorizedCount, 0);
  });

  test('révision incrémente le compteur', () async {
    await store.setStatus(2, 255, AyahStatus.memorized);
    await store.markReviewed(2, 255);
    await store.markReviewed(2, 255);
    expect(store.get(2, 255)!.reviewCount, 2);
    expect(store.get(2, 255)!.lastReviewedAt, isNotNull);
  });

  test('setRange sur une sourate entière', () async {
    await store.setRange(112, [1, 2, 3, 4], AyahStatus.memorized);
    expect(store.memorizedIn(112), 4);
    await store.setRange(112, [1, 2, 3, 4], null);
    expect(store.trackedIn(112), 0);
  });

  test('persistance locale entre deux lancements', () async {
    await store.setStatus(36, 1, AyahStatus.memorized);
    final prefs = await SharedPreferences.getInstance();
    final again = ProgressStore(prefs, AuthService(prefs));
    await again.attach(null);
    expect(again.statusOf(36, 1), AyahStatus.memorized);
  });

  test('annuler le marquage d’une sourate entière restaure l’état précédent', () async {
    await store.setStatus(112, 1, AyahStatus.learning);
    final before = store.snapshotSurah(112);
    await store.setRange(112, [1, 2, 3, 4], AyahStatus.memorized);
    expect(store.memorizedIn(112), 4);
    await store.restoreSurah(112, before);
    expect(store.memorizedIn(112), 0);
    expect(store.statusOf(112, 1), AyahStatus.learning);
    expect(store.trackedIn(112), 1);
  });

  test('memorizedPerSurah', () async {
    await store.setRange(1, [1, 2, 3], AyahStatus.memorized);
    await store.setStatus(2, 5, AyahStatus.memorized);
    final per = store.memorizedPerSurah();
    expect(per.length, 115);
    expect(per[1], 3);
    expect(per[2], 1);
  });
}
