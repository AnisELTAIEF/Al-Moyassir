import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/models.dart';
import 'package:hifidh_quran/core/quran_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('texte Qalun : 114 sourates, 6214 ayat, aucun ayah vide', () async {
    final repo = await QuranRepository.load();
    expect(repo.surahs.length, 114);
    expect(repo.surahs.fold<int>(0, (a, s) => a + s.ayahCount), QuranRepository.totalAyahs);
    expect(repo.surahs.every((s) => s.ayahs.every((a) => a.trim().isNotEmpty)), isTrue);
    expect(repo.surah(1).ayahCount, 7);
    expect(repo.surah(2).ayahCount, 285); // numérotation Qalun (6214 ayat), pas Hafs (286)
  });

  test('chaque récitateur : minutages cohérents avec le texte pour chaque sourate annoncée', () async {
    final repo = await QuranRepository.load();
    expect(repo.reciters, isNotEmpty);
    for (final r in repo.reciters) {
      for (final s in r.surahs) {
        final t = await repo.timingsFor(r.id, s);
        expect(t.length, repo.surah(s).ayahCount, reason: '${r.id} sourate $s');
        for (var i = 0; i < t.length; i++) {
          expect(t[i].ayah, i + 1, reason: '${r.id} $s ordre');
          expect(t[i].endMs, greaterThanOrEqualTo(t[i].startMs), reason: '${r.id} $s:${i + 1}');
          if (i > 0) expect(t[i].startMs, greaterThanOrEqualTo(t[i - 1].endMs), reason: '${r.id} $s:${i + 1} chevauchement');
        }
      }
    }
  });

  test('URL audio : modèle {surah:03d} remplacé', () async {
    final repo = await QuranRepository.load();
    final u = repo.reciter('mp3quran_201_199').audioUri(2);
    expect(u.toString(), 'https://cdn.mp3quran.net/audio/ahmad-tarabulsi/r1/002.mp3');
  });

  test('AyahProgress : aller-retour JSON', () {
    final p = AyahProgress(surah: 2, ayah: 255, status: AyahStatus.memorized, memorizedAt: DateTime.utc(2026, 10, 10), reviewCount: 3, updatedAt: DateTime.utc(2026, 10, 11));
    final q = AyahProgress.fromJson(p.toJson());
    expect(q.key, '2:255');
    expect(q.status, AyahStatus.memorized);
    expect(q.reviewCount, 3);
    expect(q.updatedAt.toUtc(), p.updatedAt);
  });

  test('assets du dépôt présents', () {
    expect(File('assets/fonts/ScheherazadeNew-Regular.ttf').existsSync(), isTrue);
  });
}
