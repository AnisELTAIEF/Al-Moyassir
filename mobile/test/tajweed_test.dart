import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/tajweed.dart';

void main() {
  final data = jsonDecode(File('assets/data/quran_qalun.json').readAsStringSync()) as Map<String, dynamic>;
  final surahs = (data['surahs'] as List).cast<Map<String, dynamic>>();
  String ayah(int s, int a) => (surahs[s - 1]['ayahs'] as List)[a - 1] as String;

  /// Règles présentes dans le mot n° [word] (à partir de 0) de l'ayah s:a.
  Set<TajweedRule> rules(int s, int a, int word) {
    final segs = tajweedSegments(ayah(s, a), isFirstAyahs: a <= 2);
    final out = <TajweedRule>{};
    var w = 0;
    for (final seg in segs) {
      final parts = seg.text.split(' ');
      for (var k = 0; k < parts.length; k++) {
        if (k > 0) w++;
        if (w == word && parts[k].isNotEmpty && seg.rule != null) out.add(seg.rule!);
      }
    }
    return out;
  }

  int wordOf(int s, int a, String mark) => ayah(s, a).split(' ').indexWhere((w) => w.contains(mark) && !w.startsWith('ا'));

  test('les segments recomposent exactement le texte', () {
    for (final s in surahs) {
      final ayahs = (s['ayahs'] as List).cast<String>();
      for (var i = 0; i < ayahs.length; i++) {
        expect(tajweedSegments(ayahs[i], isFirstAyahs: i < 2).map((e) => e.text).join(), ayahs[i]);
      }
    }
  });

  test('noun sakina et tanwin', () {
    expect(rules(2, 24, 9), {TajweedRule.ikhfa}); // مِن تَحْتِهَا
    expect(rules(2, 24, 7), contains(TajweedRule.ikhfa)); // جَنَّٰتٖ تَجْرِے
    expect(rules(2, 7, 2), {TajweedRule.idghamGhunna}); // مَنْ يَّقُولُ
    expect(rules(2, 4, 2), {TajweedRule.idghamGhunna}); // هُدىٗ مِّن
    expect(rules(2, 4, 3), {TajweedRule.ghunna, TajweedRule.idghamNoGhunna}); // مِّن رَّبِّهِمْ
    expect(rules(2, 26, 4), {TajweedRule.iqlab}); // مِنۢ بَعْدِ
    expect(rules(2, 6, 10), isEmpty); // عَذَابٌ عَظِيمٞ : izhar
    expect(rules(2, 7, 4), {TajweedRule.ghunna}); // ءَامَنَّا
    expect(rules(2, 2, 7), {TajweedRule.ikhfa}); // يُنفِقُونَ (dans le mot)
    expect(rules(2, 2, 1), isEmpty); // يُؤْمِنُونَ
  });

  test('mim sakina et qalqala', () {
    expect(rules(2, 7, 9), {TajweedRule.ikhfaShafawi}); // هُم بِمُؤْمِنِينَ
    expect(rules(2, 106, 9), {TajweedRule.idghamShafawi}); // لَكُم مِّن
    expect(rules(2, 26, 7), {TajweedRule.qalqala}); // وَيَقْطَعُونَ
    expect(rules(2, 26, 5), isEmpty); // بَعْدِ : soukoun sur le ع
    expect(rules(112, 4, 4), {TajweedRule.qalqala}); // أَحَدُ (fin d'ayah)
    expect(rules(2, 2, 2), isEmpty); // بِالْغَيْبِ : ب finale non en fin d'ayah
  });

  test('madd, hamzat al-wasl, lam solaire, alif muet', () {
    expect(rules(1, 7, 4), containsAll([TajweedRule.maddLazim, TajweedRule.hamzatWasl])); // اَ۬لضَّآلِّينَ
    expect(rules(2, 5, 3), {TajweedRule.maddMuttasil}); // سَوَآءٌ
    expect(rules(2, 1, 0), contains(TajweedRule.maddLazim)); // أَلَٓمِّٓ
    expect(rules(1, 2, 0), {TajweedRule.hamzatWasl, TajweedRule.lamShamsiyya}); // اَ۬لرَّحْمَٰنِ
    expect(rules(1, 1, 0), {TajweedRule.hamzatWasl}); // اِ۬لْحَمْدُ : lam lunaire
    expect(rules(2, 24, 3), {TajweedRule.silent}); // وَعَمِلُواْ
  });

  test('spécificités de Qalun', () {
    expect(rules(2, 3, 2), {TajweedRule.maddMunfasil}); // بِمَا أُنزِلَ (non marqué par le mushaf)
    expect(rules(7, 32, 4), {TajweedRule.maddMunfasil}); // جَا أَجَلُهُمْ (1re hamza tombée)
    expect(rules(2, 13, 10), containsAll([TajweedRule.maddMunfasil, TajweedRule.silent])); // قَالُواْ إِنَّا
    expect(rules(2, 20, 0), contains(TajweedRule.maddMunfasil)); // يَٰأَيُّهَا
    expect(rules(2, 3, 4), isEmpty); // إِلَيْكَ وَمَا : pas de hamza après
    expect(rules(2, 5, 4), {TajweedRule.mimJam}); // عَلَيْهِمْ ءَٰا۬نذَرْتَهُمْ
    expect(rules(4, 153, 10), {TajweedRule.mimJam}); // لَهُمْ لَا
    expect(rules(2, 7, 9), {TajweedRule.ikhfaShafawi}); // هُم بِمُؤْمِنِينَ : la lecture écrite reste prioritaire
    expect(rules(2, 5, 5), {TajweedRule.tashil, TajweedRule.ikhfa, TajweedRule.mimJam}); // ءَٰا۬نذَرْتَهُمْ
    expect(rules(13, 5, 4), {TajweedRule.tashil}); // أَٰ۟ذَا
    expect(rules(2, 30, 11), {TajweedRule.tashil}); // هَٰؤُلَآ۟ إِن
    expect(rules(4, 153, 12), {TajweedRule.ikhtilas, TajweedRule.silent}); // تَعْدُّواْ
    expect(rules(10, 35, 21), {TajweedRule.ikhtilas, TajweedRule.maddMunfasil}); // … إِلَّا // يَهْدِّے
    expect(rules(1, 1, 0), {TajweedRule.hamzatWasl}); // le wasl initial n'est pas un tas-hil
    expect(rules(9, 110, wordOf(9, 110, '\u06ea')), contains(TajweedRule.imala)); // هَارٍ
    expect(rules(11, 76, wordOf(11, 76, '\u06ec')), {TajweedRule.ishmam, TajweedRule.maddMuttasil}); // سِيٓءَ
  });

  test('chaque règle apparaît dans le Coran', () {
    final counts = <TajweedRule, int>{};
    for (final s in surahs) {
      final ayahs = (s['ayahs'] as List).cast<String>();
      for (var i = 0; i < ayahs.length; i++) {
        for (final seg in tajweedSegments(ayahs[i], isFirstAyahs: i < 2)) {
          if (seg.rule != null) counts[seg.rule!] = (counts[seg.rule!] ?? 0) + 1;
        }
      }
    }
    for (final r in TajweedRule.values) {
      expect(counts[r] ?? 0, greaterThan(0), reason: r.name);
    }
  });
}
