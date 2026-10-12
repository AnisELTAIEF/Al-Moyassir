import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/auth_service.dart';
import 'package:hifidh_quran/core/models.dart';
import 'package:hifidh_quran/core/progress_store.dart';
import 'package:hifidh_quran/core/settings.dart';
import 'package:hifidh_quran/core/tajweed.dart';
import 'package:hifidh_quran/theme.dart';
import 'package:hifidh_quran/widgets/ayah_coloring.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Rapport de contraste WCAG 2.x entre deux couleurs opaques.
double contrast(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

void main() {
  group('niveau de maîtrise', () {
    late SharedPreferences prefs;
    late ProgressStore store;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      store = ProgressStore(prefs, AuthService(prefs));
      await store.attach(null);
    });

    test('cycle au toucher : non appris → en cours → acquis → à revoir → non appris', () async {
      expect(store.storedMasteryOf(1, 1), Mastery.none);
      expect(await store.cycleMastery(1, 1), Mastery.learning);
      expect(store.statusOf(1, 1), AyahStatus.learning);
      expect(await store.cycleMastery(1, 1), Mastery.acquired);
      expect(store.statusOf(1, 1), AyahStatus.memorized);
      expect(store.get(1, 1)!.needsReview, isFalse);
      expect(await store.cycleMastery(1, 1), Mastery.review);
      expect(store.statusOf(1, 1), AyahStatus.memorized, reason: '« à revoir » reste un ayah appris');
      expect(store.get(1, 1)!.needsReview, isTrue);
      expect(store.memorizedCount, 1);
      expect(await store.cycleMastery(1, 1), Mastery.none);
      expect(store.get(1, 1), isNull);
    });

    test('« à revoir » conserve la date d’apprentissage et le nombre de révisions', () async {
      await store.setStatus(1, 3, AyahStatus.memorized);
      await store.markReviewed(1, 3);
      final before = store.get(1, 3)!;
      await store.setMastery(1, 3, Mastery.review);
      final after = store.get(1, 3)!;
      expect(after.memorizedAt, before.memorizedAt);
      expect(after.reviewCount, 1);
      // une révision lève le marquage
      await store.markReviewed(1, 3);
      expect(store.get(1, 3)!.needsReview, isFalse);
      expect(store.storedMasteryOf(1, 3), Mastery.acquired);
    });

    test('Annuler restaure l’état exact, y compris le marquage', () async {
      await store.setMastery(1, 4, Mastery.review);
      final snap = store.snapshotAyahs([(1, 4)]);
      await store.cycleMastery(1, 4);
      expect(store.get(1, 4), isNull);
      await store.restoreAyahs(snap);
      expect(store.storedMasteryOf(1, 4), Mastery.review);
    });

    test('révision en retard affichée « à revoir » selon le réglage', () async {
      await store.setStatus(1, 5, AyahStatus.memorized);
      final later = DateTime.now().add(const Duration(days: 4));
      expect(store.masteryOf(1, 5, now: later), Mastery.review);
      expect(store.masteryOf(1, 5, now: later, includeOverdue: false), Mastery.acquired);
      expect(store.masteryOf(1, 5), Mastery.acquired);
      // le toucher part du niveau enregistré (acquis), pas du niveau affiché
      expect(store.storedMasteryOf(1, 5), Mastery.acquired);
    });

    test('JSON : needsReview aller-retour, absent = false (anciennes données)', () {
      final p = AyahProgress(surah: 2, ayah: 7, status: AyahStatus.memorized, needsReview: true, updatedAt: DateTime.utc(2026, 10, 1));
      final j = p.toJson();
      expect(j['needsReview'], isTrue);
      expect(AyahProgress.fromJson(j).needsReview, isTrue);
      j.remove('needsReview');
      expect(AyahProgress.fromJson(j).needsReview, isFalse);
    });

    test('persistance locale du marquage', () async {
      await store.setMastery(3, 1, Mastery.review);
      final again = ProgressStore(prefs, AuthService(prefs));
      await again.attach(null);
      expect(again.storedMasteryOf(3, 1), Mastery.review);
    });
  });

  group('réglages', () {
    test('par mode et par compte ; tajwid hérite de l’ancien réglage global', () async {
      SharedPreferences.setMockInitialValues({'flutter.tajweed': false});
      final prefs = await SharedPreferences.getInstance();
      final s = Settings(prefs);
      expect(s.coloringIn(ReadingMode.ayah), AyahColoring.perAyah, reason: 'par ayah par défaut');
      expect(s.coloringIn(ReadingMode.mushaf), AyahColoring.perAyah);
      expect(s.tajweedIn(ReadingMode.mushaf), isFalse, reason: 'reprend l’ancien réglage global');
      s.setColoringIn(ReadingMode.ayah, AyahColoring.mastery);
      s.setTajweedIn(ReadingMode.mushaf, true);
      expect(s.coloringIn(ReadingMode.mushaf), AyahColoring.perAyah);
      s.readingMode = ReadingMode.ayah;
      expect(s.coloring, AyahColoring.mastery);
      expect(s.tajweed, isFalse);
      s.readingMode = ReadingMode.mushaf;
      expect(s.tajweed, isTrue);
      s.colorBlind = true;
      // autre compte : réglages indépendants
      s.owner = 'u2';
      expect(s.coloringIn(ReadingMode.ayah), AyahColoring.perAyah);
      expect(s.colorBlind, isFalse);
      expect(s.overdueAsReview, isTrue);
      s.owner = null;
      expect(s.coloringIn(ReadingMode.ayah), AyahColoring.mastery);
      expect(s.colorBlind, isTrue);
    });
  });

  group('palettes accessibles', () {
    for (final b in Brightness.values) {
      final theme = buildTheme(b);
      final tones = theme.extension<Tones>()!;
      final ink = theme.colorScheme.onSurface;
      // Papier des pages du mushaf et fond du mode Tahfidh.
      final papers = {'page': b == Brightness.dark ? theme.colorScheme.surface : const Color(0xFFFBF8EF), 'liste': tones.page};
      for (final cb in [false, true]) {
        for (final pe in papers.entries) {
          final paper = pe.value;
          final bgs = <String, Color>{
            for (var a = 1; a <= 12; a++) 'ayah $a': perAyahBackground(a, paper: paper, brightness: b, colorBlind: cb),
            for (var a = 1; a <= 2; a++) 'ayah $a (2 couleurs)': perAyahBackground(a, paper: paper, brightness: b, colorBlind: cb, colors: 2),
            for (final m in Mastery.values.skip(1)) m.name: masteryBackground(m, paper: paper, brightness: b, colorBlind: cb)!,
          };
          final tag = '${b.name}, ${pe.key}, daltonisme=$cb';

          test('texte lisible sur chaque fond ($tag)', () {
            for (final e in bgs.entries) {
              expect(contrast(ink, e.value), greaterThanOrEqualTo(7), reason: '${e.key} : AAA (7:1) attendu');
              final rules = TajweedRule.values.where((r) => r != TajweedRule.hamzatWasl && r != TajweedRule.lamShamsiyya && r != TajweedRule.silent);
              for (final r in rules) {
                // Couleurs du tajwid : au moins 3:1, seuil WCAG AA du texte de grande taille (le texte coranique fait 20 px et plus).
                // Les lettres non prononcées (hamzat al-wasl, lam shamsiyya…) sont volontairement estompées : exclues.
                expect(contrast(r.color(b), e.value), greaterThanOrEqualTo(3.0), reason: '${r.name} sur ${e.key}');
              }
            }
          });

          test('surlignage doré de récitation distinct de tous les fonds ($tag)', () {
            final playing = Color.alphaBlend(tones.gold.withValues(alpha: 0.30), paper);
            for (final e in bgs.entries) {
              final d = (playing.r - e.value.r).abs() + (playing.g - e.value.g).abs() + (playing.b - e.value.b).abs();
              expect(d, greaterThan(0.10), reason: e.key);
            }
          });

          test('fonds de maîtrise distincts entre eux et du papier ($tag)', () {
            final ms = [for (final m in Mastery.values.skip(1)) bgs[m.name]!];
            for (var i = 0; i < ms.length; i++) {
              expect(ms[i], isNot(paper));
              for (var j = i + 1; j < ms.length; j++) {
                final d = (ms[i].r - ms[j].r).abs() + (ms[i].g - ms[j].g).abs() + (ms[i].b - ms[j].b).abs();
                expect(d, greaterThan(0.08), reason: '${Mastery.values[i + 1].name} / ${Mastery.values[j + 1].name}');
              }
            }
          });

          test('ayat voisins de couleurs différentes ($tag)', () {
            for (var a = 1; a < 12; a++) {
              expect(bgs['ayah $a'], isNot(bgs['ayah ${a + 1}']));
            }
            final a1 = bgs['ayah 1 (2 couleurs)']!, a2 = bgs['ayah 2 (2 couleurs)']!;
            expect((a1.r - a2.r).abs() + (a1.g - a2.g).abs() + (a1.b - a2.b).abs(), greaterThan(0.04), reason: 'alternance à 2 couleurs visible');
          });
        }
      }
    }
  });
}
