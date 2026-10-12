import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Explication d'un ayah tirée du Tafsir d'Ibn Kathir.
class TafsirEntry {
  const TafsirEntry({required this.hafsAyahs, required this.extracts});

  /// Ayat correspondants dans la numérotation de Hafs (celle du tafsir) : un ayah de Qalun
  /// peut couvrir deux ayat de Hafs, ou une partie d'un seul.
  final List<int> hafsAyahs;

  /// Un ou deux passages du tafsir, recopiés tels quels (jamais réécrits).
  final List<String> extracts;
}

/// Tafsir d'Ibn Kathir, embarqué dans l'app (fonctionne hors ligne).
///
/// Pour chaque ayah de Qalun, une ou deux explications au plus : les paragraphes d'Ibn Kathir
/// qui commentent le plus directement les mots de l'ayah (choix automatique, texte non modifié).
/// Source : texte arabe d'Ibn Kathir publié par quran.com.
class TafsirRepository {
  TafsirRepository._(this._surahs);

  static TafsirRepository? _instance;
  static Future<TafsirRepository>? _loading;

  final List<List<TafsirEntry>> _surahs;

  /// Chargé à la première demande (environ 4 Mo de texte, décodé hors du fil d'affichage).
  static Future<TafsirRepository> load() {
    if (_instance != null) return Future.value(_instance);
    return _loading ??= () async {
      final raw = await rootBundle.loadString('assets/data/tafsir_ibn_kathir.json');
      final repo = TafsirRepository._(await compute(_parse, raw));
      _instance = repo;
      return repo;
    }();
  }

  @visibleForTesting
  static TafsirRepository parse(String raw) => TafsirRepository._(_parse(raw));

  static List<List<TafsirEntry>> _parse(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return [
      for (final s in j['surahs'] as List)
        [
          for (final a in s as List)
            TafsirEntry(
              hafsAyahs: [for (final h in (a as Map<String, dynamic>)['h'] as List) (h as num).toInt()],
              extracts: [for (final t in a['t'] as List) t as String],
            ),
        ],
    ];
  }

  int get surahCount => _surahs.length;
  int ayahCount(int surah) => _surahs[surah - 1].length;

  /// Explication de l'ayah [ayah] (numérotation de Qalun) de la sourate [surah].
  TafsirEntry? of(int surah, int ayah) {
    if (surah < 1 || surah > _surahs.length) return null;
    final s = _surahs[surah - 1];
    return ayah < 1 || ayah > s.length ? null : s[ayah - 1];
  }
}
