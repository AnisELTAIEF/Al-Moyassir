import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/khatma_estimate.dart';

void main() {
  final today = DateTime(2026, 10, 18);

  test('7 j/semaine, 1 h, 10 ayat/h, sans révision : 70 ayat par semaine, 6214 ayat en 622 jours', () {
    final e = estimateKhatma(
        memorized: 0, daysPerWeek: 7, minutesPerSession: 60, ayatPerHour: 10, reviewShare: 0, today: today)!;
    expect(e.ayatPerWeek, 70);
    expect(e.remainingAyat, 6214);
    expect(e.days, 622); // 6214 / 10 par jour = 621,4 → 622
    expect(e.date, today.add(const Duration(days: 622)));
  });

  test('la révision ralentit : 30 % de révision = 70 % du rythme', () {
    final e = estimateKhatma(
        memorized: 0, daysPerWeek: 7, minutesPerSession: 60, ayatPerHour: 10, reviewShare: 0.3, today: today)!;
    expect(e.ayatPerWeek, closeTo(49, 1e-9));
  });

  test('ce qui est déjà appris est retiré', () {
    final e = estimateKhatma(
        memorized: 6204, daysPerWeek: 7, minutesPerSession: 60, ayatPerHour: 10, reviewShare: 0, today: today)!;
    expect(e.remainingAyat, 10);
    expect(e.days, 1);
  });

  test('khatma déjà complète : 0 jour, même sans rythme', () {
    final e = estimateKhatma(
        memorized: 6214, daysPerWeek: 0, minutesPerSession: 0, ayatPerHour: 0, reviewShare: 0, today: today)!;
    expect(e.days, 0);
    expect(e.remainingAyat, 0);
  });

  test('plus que le total, ou rythme nul : pas de division par zéro', () {
    expect(estimateKhatma(memorized: 9999, daysPerWeek: 5, minutesPerSession: 30, ayatPerHour: 10, reviewShare: 0)!.days, 0);
    expect(estimateKhatma(memorized: 0, daysPerWeek: 0, minutesPerSession: 30, ayatPerHour: 10, reviewShare: 0), isNull);
    expect(estimateKhatma(memorized: 0, daysPerWeek: 5, minutesPerSession: 30, ayatPerHour: 0, reviewShare: 0), isNull);
  });
}
