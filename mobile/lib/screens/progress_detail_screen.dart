import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/common.dart';
import '../widgets/khatam.dart';
import '../widgets/mosaic.dart';
import '../core/i18n.dart';

/// Progression détaillée d'une personne (vue admin global / admin de groupe).
class ProgressDetailScreen extends StatelessWidget {
  const ProgressDetailScreen({super.key, required this.title, required this.load, this.header});
  final String title;
  final Future<List<AyahProgress>> Function() load;
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AsyncView<List<AyahProgress>>(
        load: load,
        builder: (context, items, _) {
          final per = List<int>.filled(115, 0);
          for (final p in items) {
            if (p.status == AyahStatus.memorized) per[p.surah]++;
          }
          final memorized = per.fold<int>(0, (a, b) => a + b);
          final learning = items.length - memorized;
          final surahs = [for (var n = 1; n <= 114; n++) if (items.any((p) => p.surah == n)) n];
          final recent = [...items]..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
          return Constrained(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
              if (header != null) ...[header!, const SizedBox(height: 12)],
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tr('{n} ayat appris · {p}', {'n': memorized, 'p': pct(memorized, QuranRepository.totalAyahs)}), style: context.text.titleLarge),
                    Text(tr('{n} en cours', {'n': learning}), style: TextStyle(color: context.tones.muted)),
                    const SizedBox(height: 14),
                    KhatmaMosaic(memorized: per, ayahCounts: [0, for (final s in repo.surahs) s.ayahCount]),
                  ]),
                ),
              ),
              if (surahs.isNotEmpty) SectionTitle(tr('Par sourate')),
              for (final n in surahs)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    KhatamBadge(label: '$n', size: 34, fill: per[n] == repo.surah(n).ayahCount ? context.tones.gold : null),
                    const SizedBox(width: 10),
                    SizedBox(width: 110, child: ArabicText(repo.surah(n).name, size: 20, height: 1.4)),
                    Expanded(child: ThinBar(value: per[n] / repo.surah(n).ayahCount)),
                    const SizedBox(width: 10),
                    Text('${per[n]}/${repo.surah(n).ayahCount}', style: TextStyle(color: context.tones.muted)),
                  ]),
                ),
              if (recent.isNotEmpty) SectionTitle(tr('Activité récente')),
              for (final p in recent.take(15))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(p.status == AyahStatus.memorized ? Icons.check_circle : Icons.timelapse,
                      color: p.status == AyahStatus.memorized ? context.colors.primary : context.tones.red),
                  title: Text(tr('{s} — ayah {a}', {'s': repo.surah(p.surah).name, 'a': p.ayah}), textDirection: TextDirection.rtl, textAlign: TextAlign.left),
                  subtitle: Text(tr('{st} · {t} · {n} révision(s)', {'st': p.status == AyahStatus.memorized ? tr('appris') : tr('en cours'), 't': since(p.updatedAt), 'n': p.reviewCount})),
                ),
              if (items.isEmpty) EmptyState(icon: Icons.hourglass_empty, title: tr('Aucun ayah suivi pour l’instant')),
            ]),
          );
        },
      ),
    );
  }
}
