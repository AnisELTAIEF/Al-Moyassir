import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/quran_repository.dart';
import 'package:hifidh_quran/core/tafsir.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('tafsir Ibn Kathir : un à deux extraits pour chacun des 6214 ayat de Qalun', () async {
    final repo = await QuranRepository.load();
    final t = TafsirRepository.parse(File('assets/data/tafsir_ibn_kathir.json').readAsStringSync());
    expect(t.surahCount, 114);
    for (final s in repo.surahs) {
      expect(t.ayahCount(s.number), s.ayahCount, reason: 'sourate ${s.number}');
      for (var a = 1; a <= s.ayahCount; a++) {
        final e = t.of(s.number, a)!;
        expect(e.extracts.length, inInclusiveRange(1, 2), reason: '${s.number}:$a');
        expect(e.hafsAyahs, isNotEmpty);
        for (final x in e.extracts) {
          expect(x.trim(), isNotEmpty);
          expect(x.length, lessThan(800), reason: 'extrait court ${s.number}:$a');
        }
      }
    }
  });

  test('correspondance Qalun → Hafs sur des cas connus', () {
    final t = TafsirRepository.parse(File('assets/data/tafsir_ibn_kathir.json').readAsStringSync());
    // Al-Fatiha : la basmala n'est pas un ayah chez Qalun → l'ayah 1 (al-hamdu) = Hafs 1:2.
    expect(t.of(1, 1)!.hafsAyahs, [2]);
    // « الٓمٓ » n'est pas compté seul dans le compte madanien : Qalun 2:1 = Hafs 2:1–2.
    expect(t.of(2, 1)!.hafsAyahs, [1, 2]);
    expect(t.of(2, 285)!.hafsAyahs, [286]);
    // Al-'Asr : explication du mot العصر.
    expect(t.of(103, 1)!.extracts.first, contains('الزمان'));
    expect(t.of(500, 1), isNull);
  });
}
