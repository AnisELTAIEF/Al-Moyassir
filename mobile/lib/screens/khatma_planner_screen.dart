import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/khatma_estimate.dart';
import '../core/progress_store.dart';
import '../core/settings.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// « Combien de temps pour terminer la khatma ? » : quelques questions sur le temps disponible,
/// puis une estimation. Tout est calculé sur l'appareil.
class KhatmaPlannerScreen extends StatefulWidget {
  const KhatmaPlannerScreen({super.key});

  @override
  State<KhatmaPlannerScreen> createState() => _KhatmaPlannerScreenState();
}

class _KhatmaPlannerScreenState extends State<KhatmaPlannerScreen> {
  double _days = 5;
  double _minutes = 30;
  String _pace = 'medium';
  double _review = 30; // % du temps consacré à la révision

  @override
  void initState() {
    super.initState();
    final s = context.read<Settings>();
    _days = s.khatmaDays.toDouble();
    _minutes = s.khatmaMinutes.toDouble();
    _pace = s.khatmaPace;
    _review = s.khatmaReview.toDouble();
  }

  /// Chaque réglage est mémorisé tout de suite : l'accueil affiche les jours restants d'après ce rythme.
  void _save() => context.read<Settings>().saveKhatmaPlan(days: _days.round(), minutes: _minutes.round(), pace: _pace, review: _review.round());

  String _duration(int days) {
    if (days < 60) return tr('environ {n} jours', {'n': days});
    final months = (days / 30.44).round();
    if (months < 24) return tr('environ {n} mois', {'n': months});
    final y = months ~/ 12, m = months % 12;
    return m == 0 ? tr('environ {y} ans', {'y': y}) : tr('environ {y} ans et {m} mois', {'y': y, 'm': m});
  }

  @override
  Widget build(BuildContext context) {
    final memorized = context.watch<ProgressStore>().memorizedCount;
    final est = estimateKhatma(
      memorized: memorized,
      daysPerWeek: _days.round(),
      minutesPerSession: _minutes.round(),
      ayatPerHour: kPaceAyatPerHour[_pace]!,
      reviewShare: _review / 100,
    );

    return Scaffold(
      appBar: AppBar(title: Text(tr('Estimer ma khatma'))),
      body: SafeArea(
        child: Constrained(
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
            Text(
              tr('Il vous reste {n} ayat à apprendre sur {total}.',
                  {'n': QuranRepository.totalAyahs - memorized, 'total': QuranRepository.totalAyahs}),
              style: TextStyle(color: context.tones.muted),
            ),
            SectionTitle(tr('Votre disponibilité')),
            _slider(
              label: tr('Jours par semaine : {n}', {'n': _days.round()}),
              value: _days,
              min: 1,
              max: 7,
              divisions: 6,
              onChanged: (v) {
                setState(() => _days = v);
                _save();
              },
            ),
            _slider(
              label: tr('Minutes par séance : {n}', {'n': _minutes.round()}),
              value: _minutes,
              min: 10,
              max: 180,
              divisions: 34,
              onChanged: (v) {
                setState(() => _minutes = v);
                _save();
              },
            ),
            SectionTitle(tr('Votre rythme de mémorisation')),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 'slow', label: Text(tr('Lent'))),
                ButtonSegment(value: 'medium', label: Text(tr('Moyen'))),
                ButtonSegment(value: 'fast', label: Text(tr('Soutenu'))),
              ],
              selected: {_pace},
              onSelectionChanged: (s) {
                setState(() => _pace = s.first);
                _save();
              },
            ),
            const SizedBox(height: 6),
            Text(
              tr('Environ {n} nouveaux ayat par heure (indicatif).', {'n': kPaceAyatPerHour[_pace]!.round()}),
              style: TextStyle(fontSize: 13, color: context.tones.muted),
            ),
            _slider(
              label: tr('Part du temps consacrée à la révision : {p} %', {'p': _review.round()}),
              value: _review,
              min: 0,
              max: 60,
              divisions: 12,
              onChanged: (v) {
                setState(() => _review = v);
                _save();
              },
            ),
            const SizedBox(height: 12),
            _result(context, est),
            const SizedBox(height: 12),
            Text(
              tr('Estimation indicative : elle suppose un rythme régulier. Votre rythme réel peut varier.'),
              style: TextStyle(fontSize: 12.5, color: context.tones.muted),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _slider({
    required String label,
    required double value,
    required double min,
    required double max,
    required int divisions,
    required ValueChanged<double> onChanged,
  }) =>
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label),
          Slider(value: value, min: min, max: max, divisions: divisions, onChanged: onChanged),
        ]),
      );

  Widget _result(BuildContext context, KhatmaEstimate? est) {
    final cs = context.colors;
    if (est == null) {
      return Card(child: Padding(padding: const EdgeInsets.all(18), child: Text(tr('Choisissez au moins un jour et quelques minutes.'))));
    }
    if (est.remainingAyat == 0) {
      return Card(
        color: cs.primary,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(tr('Khatma terminée : il ne reste aucun ayah à apprendre.'),
              style: TextStyle(color: cs.onPrimary, fontSize: 18, fontWeight: FontWeight.w600)),
        ),
      );
    }
    return Card(
      color: cs.primary,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('Durée estimée'), style: TextStyle(color: cs.onPrimary.withValues(alpha: 0.85))),
          const SizedBox(height: 4),
          Text(_duration(est.days), style: TextStyle(color: cs.onPrimary, fontSize: 28, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Text(tr('Date probable : {d}', {'d': fmtDate(est.date)}), style: TextStyle(color: cs.onPrimary)),
          Text(tr('Environ {n} ayat par semaine.', {'n': est.ayatPerWeek.round()}), style: TextStyle(color: cs.onPrimary)),
        ]),
      ),
    );
  }
}
