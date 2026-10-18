import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/quran_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('les 604 pages couvrent chaque ayah exactement une fois', () async {
    final repo = await QuranRepository.load();
    expect(repo.mushafPages, hasLength(604));
    final seen = <AyahRef>{};
    var total = 0;
    for (var p = 1; p <= 604; p++) {
      final refs = repo.ayahsOfMushafPage(p);
      expect(refs, isNotEmpty, reason: 'page $p vide');
      for (final r in refs) {
        expect(seen.add(r), isTrue, reason: 'ayah ${r.$1}:${r.$2} présent deux fois (page $p)');
        expect(repo.mushafPageOf(r.$1, r.$2), p, reason: 'page de ${r.$1}:${r.$2}');
      }
      total += refs.length;
    }
    expect(total, QuranRepository.totalAyahs);
    expect(seen, hasLength(QuranRepository.totalAyahs));
  });
}
