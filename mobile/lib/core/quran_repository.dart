import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'models.dart';

/// Texte (riwaya de Qalun, numérotation du mushaf Awqaf libyen : 6214 ayat),
/// récitateurs et minutages par ayah, tous embarqués dans l'app.
class QuranRepository {
  static const totalAyahs = 6214;

  final List<Surah> surahs;
  final List<Reciter> reciters;
  final Divisions divisions;

  /// Début (sourate, ayah) de chacune des 604 pages du mushaf.
  final List<AyahRef> mushafPages;
  final Map<String, Map<int, List<AyahTiming>>> _timings = {};

  QuranRepository._(this.surahs, this.reciters, this.divisions, this.mushafPages);

  static Future<QuranRepository> load() async {
    // Lecture des fichiers en parallèle ; le texte (1,4 Mo) est décodé hors du fil d'affichage.
    final files = await Future.wait([
      rootBundle.loadString('assets/data/quran_qalun.json'),
      rootBundle.loadString('assets/data/reciters.json'),
      rootBundle.loadString('assets/data/divisions.json'),
      rootBundle.loadString('assets/data/mushaf_pages.json'),
    ]);
    final surahs = await compute(_parseSurahs, files[0]);
    final reciters = [for (final r in jsonDecode(files[1]) as List) Reciter.fromJson(r as Map<String, dynamic>)];
    final div = jsonDecode(files[2]) as Map<String, dynamic>;
    final pages = jsonDecode(files[3]) as Map<String, dynamic>;
    return QuranRepository._(surahs, reciters, Divisions.fromJson(div, surahs), [
      for (final p in pages['pages'] as List) ((p[0] as num).toInt(), (p[1] as num).toInt()),
    ]);
  }

  static List<Surah> _parseSurahs(String raw) {
    final quran = jsonDecode(raw) as Map<String, dynamic>;
    return [
      for (final s in quran['surahs'] as List)
        Surah((s['n'] as num).toInt(), s['name'] as String, List<String>.unmodifiable(s['ayahs'] as List)),
    ];
  }

  Surah surah(int n) => surahs[n - 1];

  /// Page du mushaf (1..604) qui contient cet ayah.
  int mushafPageOf(int surah, int ayah) {
    var lo = 0, hi = mushafPages.length - 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) ~/ 2;
      final p = mushafPages[mid];
      if (p.$1 < surah || (p.$1 == surah && p.$2 <= ayah)) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }

  /// Ayat de la page [page] (1..604), éventuellement sur plusieurs sourates.
  List<AyahRef> ayahsOfMushafPage(int page) {
    final out = <AyahRef>[];
    var (s, a) = mushafPages[page - 1];
    final end = page < mushafPages.length ? mushafPages[page] : null;
    while (s <= 114 && (end == null || s < end.$1 || (s == end.$1 && a < end.$2))) {
      out.add((s, a));
      if (a < surahs[s - 1].ayahCount) {
        a++;
      } else {
        s++;
        a = 1;
      }
    }
    return out;
  }

  Reciter reciter(String id) => reciters.firstWhere((r) => r.id == id, orElse: () => reciters.first);

  /// Minutages (ms) des ayat d'une sourate pour un récitateur ; vide si indisponibles.
  Future<List<AyahTiming>> timingsFor(String reciterId, int surah) async {
    var map = _timings[reciterId];
    if (map == null) {
      final raw = jsonDecode(await rootBundle.loadString('assets/data/timings/$reciterId.json')) as Map<String, dynamic>;
      map = {
        for (final e in (raw['surahs'] as Map<String, dynamic>).entries)
          int.parse(e.key): [
            for (final t in e.value as List)
              AyahTiming((t[0] as num).toInt(), (t[1] as num).toInt(), (t[2] as num).toInt()),
          ],
      };
      _timings[reciterId] = map;
    }
    return map[surah] ?? const [];
  }
}

/// Position d'un ayah dans le Coran.
typedef AyahRef = (int surah, int ayah);

/// Juz, hizb et huitièmes de hizb (athmān, marqués ۞) du mushaf libyen de Qalun.
///
/// 60 hizb de 8 athmān ; un juz = 2 hizb. Chaque marqueur est placé devant un mot
/// (presque toujours le premier d'un ayah). Un ayah appartient au hizb où il commence.
class Divisions {
  Divisions._(this.thumun, this._ayahCounts);

  factory Divisions.fromJson(Map<String, dynamic> json, List<Surah> surahs) => Divisions._(
        [for (final t in json['thumun'] as List) ((t[0] as num).toInt(), (t[1] as num).toInt(), (t[2] as num).toInt())],
        [0, for (final s in surahs) s.ayahCount],
      );

  static const hizbCount = 60, juzCount = 30;

  /// (sourate, ayah, n° du mot) de chaque marqueur, dans l'ordre ; le 1er est le début du Coran.
  final List<(int, int, int)> thumun;
  final List<int> _ayahCounts;

  late final Map<String, int> _wordOfMarker = {
    for (final t in thumun.skip(1)) '${t.$1}:${t.$2}': t.$3,
  };
  late final Map<String, int> _markerIndex = {
    for (var i = 1; i < thumun.length; i++) '${thumun[i].$1}:${thumun[i].$2}': i,
  };

  /// Le marqueur ۞ éventuel dans cet ayah : (n° du mot, indice du huitième dans le Coran).
  (int word, int index)? markerIn(int surah, int ayah) {
    final w = _wordOfMarker['$surah:$ayah'];
    return w == null ? null : (w, _markerIndex['$surah:$ayah']!);
  }

  /// Premier ayah « entier » du hizb [h] (1..60).
  AyahRef hizbStart(int h) {
    final t = thumun[(h - 1) * 8];
    return t.$3 > 1 ? _nextAyah((t.$1, t.$2)) : (t.$1, t.$2);
  }

  AyahRef juzStart(int j) => hizbStart(2 * j - 1);

  AyahRef _nextAyah(AyahRef r) => r.$2 < _ayahCounts[r.$1] ? (r.$1, r.$2 + 1) : (r.$1 + 1, 1);

  static int _cmp(AyahRef a, AyahRef b) => a.$1 != b.$1 ? a.$1 - b.$1 : a.$2 - b.$2;

  int hizbOf(int surah, int ayah) {
    var lo = 1, hi = hizbCount;
    while (lo < hi) {
      final mid = (lo + hi + 1) ~/ 2;
      if (_cmp(hizbStart(mid), (surah, ayah)) <= 0) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  int juzOf(int surah, int ayah) => (hizbOf(surah, ayah) + 1) ~/ 2;

  /// Le hizb qui commence exactement à cet ayah (pour afficher un bandeau), sinon null.
  int? hizbStartingAt(int surah, int ayah) {
    final h = hizbOf(surah, ayah);
    final s = hizbStart(h);
    return s.$1 == surah && s.$2 == ayah ? h : null;
  }

  late final List<List<AyahRef>> _hizbAyahs = [for (var h = 1; h <= hizbCount; h++) _computeHizb(h)];

  /// Ayat du hizb [h] (1..60), dans l'ordre.
  List<AyahRef> ayahsOfHizb(int h) => _hizbAyahs[h - 1];

  List<AyahRef> _computeHizb(int h) {
    final out = <AyahRef>[];
    var r = hizbStart(h);
    final end = h < hizbCount ? hizbStart(h + 1) : null;
    while (r.$1 <= 114 && (end == null || _cmp(r, end) < 0)) {
      out.add(r);
      if (r.$1 == 114 && r.$2 == _ayahCounts[114]) break;
      r = _nextAyah(r);
    }
    return out;
  }

  List<AyahRef> ayahsOfJuz(int j) => [...ayahsOfHizb(2 * j - 1), ...ayahsOfHizb(2 * j)];

  /// Sourates (au moins en partie) dans le hizb, pour l'affichage.
  List<int> surahsOfHizb(int h) => {for (final r in ayahsOfHizb(h)) r.$1}.toList();
}
