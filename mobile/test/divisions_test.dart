import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/models.dart';
import 'package:hifidh_quran/core/quran_repository.dart';

void main() {
  final q = jsonDecode(File('assets/data/quran_qalun.json').readAsStringSync()) as Map<String, dynamic>;
  final surahs = [for (final s in q['surahs'] as List) Surah(s['n'] as int, s['name'] as String, (s['ayahs'] as List).cast<String>())];
  final d = Divisions.fromJson(jsonDecode(File('assets/data/divisions.json').readAsStringSync()) as Map<String, dynamic>, surahs);
  String firstWord(AyahRef r) => surahs[r.$1 - 1].ayahs[r.$2 - 1].split(' ').first;

  test('60 hizb, 30 juz, couvrant les 6214 ayat sans recouvrement', () {
    final all = [for (var h = 1; h <= 60; h++) ...d.ayahsOfHizb(h)];
    expect(all.length, 6214);
    expect(all.toSet().length, 6214);
    expect([for (var j = 1; j <= 30; j++) ...d.ayahsOfJuz(j)].length, 6214);
  });

  test('débuts connus', () {
    expect(d.juzStart(1), (1, 1));
    expect(firstWord(d.juzStart(2)), 'سَيَقُولُ');
    expect(firstWord(d.juzStart(3)), 'تِلْكَ');
    expect(d.hizbStart(59).$1, 78); // عَمَّ
    expect(d.hizbStart(60), (87, 1)); // سَبِّحِ
    expect(d.juzOf(114, 6), 30);
    expect(d.hizbOf(2, 140), 2);
    expect(d.hizbOf(2, 141), 3);
    expect(d.hizbStartingAt(2, 141), 3);
    expect(d.hizbStartingAt(2, 142), isNull);
  });

  test('marqueurs ۞ dans le texte', () {
    expect(d.markerIn(2, 13)?.$1, 1);
    expect(d.markerIn(2, 84)?.$1, greaterThan(1)); // au milieu de l'ayah
    expect(d.markerIn(2, 14), isNull);
  });

  test('604 pages du mushaf couvrant les 6214 ayat dans l’ordre', () {
    final raw = jsonDecode(File('assets/data/mushaf_pages.json').readAsStringSync()) as Map<String, dynamic>;
    final starts = [for (final p in raw['pages'] as List) ((p[0] as num).toInt(), (p[1] as num).toInt())];
    expect(starts.length, 604);
    expect(starts.first, (1, 1));
    expect(starts[1], (2, 1));
    expect(starts.last.$1, 112); // dernière page : al-Ikhlas, al-Falaq, an-Nas
    for (var i = 1; i < starts.length; i++) {
      final a = starts[i - 1], b = starts[i];
      expect(a.$1 < b.$1 || (a.$1 == b.$1 && a.$2 < b.$2), isTrue, reason: 'page ${i + 1}');
      expect(b.$2, lessThanOrEqualTo(surahs[b.$1 - 1].ayahCount));
    }
  });
}
