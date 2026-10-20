import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/prayer_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Méthode « Tunisie » comparée au calendrier officiel (ministère des Affaires religieuses)
/// de Monastir, octobre 2026 : Fajr, Dhuhr, ‘Asr, Maghrib, ‘Ichâ’ — à une minute près.
void main() {
  test('Monastir, octobre 2026 : horaires du calendrier officiel à une minute près', () async {
    SharedPreferences.setMockInitialValues({'pr_lat': 35.7643, 'pr_lng': 10.8113});
    final s = PrayerService(await SharedPreferences.getInstance());
    addTearDown(s.dispose);
    const official = {
      1: ['04:46', '12:13', '15:28', '18:03', '19:25'],
      10: ['04:54', '12:11', '15:19', '17:50', '19:13'],
      20: ['05:02', '12:09', '15:09', '17:37', '19:00'],
      31: ['05:11', '12:07', '15:00', '17:24', '18:49'],
    };
    int minutes(String hm) => int.parse(hm.substring(0, 2)) * 60 + int.parse(hm.substring(3));
    official.forEach((day, expected) {
      final t = s.timesOn(DateTime(2026, 10, day));
      final got = [Salat.fajr, Salat.dhuhr, Salat.asr, Salat.maghrib, Salat.isha].map((x) {
        final tn = t[x]!.toUtc().add(const Duration(hours: 1)); // Tunisie : UTC+1 toute l'année
        return tn.hour * 60 + tn.minute;
      }).toList();
      for (var i = 0; i < 5; i++) {
        expect((got[i] - minutes(expected[i])).abs(), lessThanOrEqualTo(1), reason: '$day octobre, prière ${i + 1} : ${expected[i]}');
      }
    });
  });
}
