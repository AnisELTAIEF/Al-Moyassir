import 'quran_repository.dart';

/// Estimation du temps qu'il reste pour terminer la khatma (mémorisation complète des 6214 ayat).
class KhatmaEstimate {
  const KhatmaEstimate({required this.remainingAyat, required this.ayatPerWeek, required this.days, required this.date});

  /// Ayat qu'il reste à apprendre.
  final int remainingAyat;

  /// Nouveaux ayat appris par semaine, une fois la part de révision retirée.
  final double ayatPerWeek;

  /// Nombre de jours (calendaires) jusqu'à la fin ; 0 si la khatma est déjà complète.
  final int days;
  final DateTime date;
}

/// Rythmes indicatifs de mémorisation, en nouveaux ayat par heure (hors révision).
/// Ce sont des ordres de grandeur pour aider à se situer, pas des mesures : chacun se connaît.
const kPaceAyatPerHour = {'slow': 6.0, 'medium': 12.0, 'fast': 20.0};

/// Calcule la durée restante à partir de ce que l'élève peut consacrer au hifdh.
///
/// [reviewShare] (0 à < 1) est la part du temps consacrée à la révision : elle ne fait pas avancer
/// les nouveaux ayat. Renvoie `null` si le rythme obtenu est nul (rien ne pourra avancer).
KhatmaEstimate? estimateKhatma({
  required int memorized,
  required int daysPerWeek,
  required int minutesPerSession,
  required double ayatPerHour,
  required double reviewShare,
  DateTime? today,
}) {
  final remaining = (QuranRepository.totalAyahs - memorized).clamp(0, QuranRepository.totalAyahs);
  final from = today ?? DateTime.now();
  final perWeek = daysPerWeek * (minutesPerSession / 60) * (1 - reviewShare) * ayatPerHour;
  if (remaining == 0) return KhatmaEstimate(remainingAyat: 0, ayatPerWeek: perWeek, days: 0, date: from);
  if (perWeek <= 0) return null;
  final days = (remaining / (perWeek / 7)).ceil();
  return KhatmaEstimate(remainingAyat: remaining, ayatPerWeek: perWeek, days: days, date: from.add(Duration(days: days)));
}
