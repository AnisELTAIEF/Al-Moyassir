import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/quran_repository.dart';
import 'package:hifidh_quran/core/tajweed.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('tajwid : la ligature lam-alif (لا) n’est jamais coupée entre deux couleurs', () async {
    final repo = await QuranRepository.load();
    final marks = RegExp('[ً-ٰٟۖ-ۭ]');
    var lamAlefs = 0;
    for (final s in repo.surahs) {
      for (var i = 0; i < s.ayahCount; i++) {
        final text = s.ayahs[i];
        final segs = tajweedSegments(text, isFirstAyahs: i < 2);
        expect(segs.map((x) => x.text).join(), text, reason: 'texte inchangé ${s.number}:${i + 1}');
        for (var k = 0; k + 1 < segs.length; k++) {
          final before = segs[k].text.replaceAll(marks, '');
          final after = segs[k + 1].text.replaceAll(marks, '');
          if (before.isEmpty || after.isEmpty) continue;
          final cut = before.endsWith('ل') && 'اأإآٱ'.contains(after[0]);
          if (cut) lamAlefs++;
          expect(cut, isFalse, reason: '${s.number}:${i + 1} « ${segs[k].text} | ${segs[k + 1].text} »');
        }
      }
    }
    expect(lamAlefs, 0);
  });

  test('« أَلَا إِنَّهُمْ » (2:11) : le lam et l’alif portent ensemble la couleur du madd', () async {
    final repo = await QuranRepository.load();
    final segs = tajweedSegments(repo.surah(2).ayahs[10]);
    final seg = segs.firstWhere((x) => x.rule == TajweedRule.maddMunfasil);
    expect(seg.text.replaceAll(RegExp('[\u064B-\u065F\u0670\u06D6-\u06ED]'), ''), startsWith('لا'));
    expect(seg.rule, TajweedRule.maddMunfasil);
  });
}
