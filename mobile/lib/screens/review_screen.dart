import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/khatam.dart';
import 'reader_screen.dart';
import '../core/i18n.dart';

/// Révision : les ayat appris les moins récemment révisés, et les ayat en cours.
class ReviewScreen extends StatelessWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    DateTime ref(AyahProgress p) => p.lastReviewedAt ?? p.memorizedAt ?? p.updatedAt;
    final review = store.all.where((p) => p.status == AyahStatus.memorized).toList()..sort((a, b) => ref(a).compareTo(ref(b)));
    final learning = store.all.where((p) => p.status == AyahStatus.learning).toList()
      ..sort((a, b) => a.surah != b.surah ? a.surah.compareTo(b.surah) : a.ayah.compareTo(b.ayah));

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Réviser')),
          actions: [
            if (store.syncing)
              const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))
            else
              IconButton(tooltip: tr('Synchroniser'), onPressed: store.sync, icon: const Icon(Icons.sync)),
          ],
          bottom: TabBar(tabs: [Tab(text: tr('À réviser ({n})', {'n': review.length})), Tab(text: tr('En cours ({n})', {'n': learning.length}))]),
        ),
        body: TabBarView(children: [
          _List(
            items: review,
            repo: repo,
            empty: EmptyState(
              icon: Icons.check_circle_outline,
              title: tr('Rien à réviser pour l’instant'),
              body: tr('Les ayat que vous marquez « Appris » apparaîtront ici, les moins récemment révisés en premier.'),
            ),
            subtitle: (p) => p.reviewCount > 0 ? tr('Dernière révision : {t} · {n} fois', {'t': since(p.lastReviewedAt), 'n': p.reviewCount}) : tr('Dernière révision : {t}', {'t': since(p.lastReviewedAt)}),
            action: (p) => IconButton.filledTonal(
              tooltip: tr('J’ai révisé'),
              onPressed: () {
                store.markReviewed(p.surah, p.ayah);
                snack(context, tr('Révision enregistrée — {s}, ayah {a}', {'s': repo.surah(p.surah).name, 'a': p.ayah}));
              },
              icon: const Icon(Icons.check),
            ),
          ),
          _List(
            items: learning,
            repo: repo,
            empty: EmptyState(
              icon: Icons.timelapse,
              title: tr('Aucun ayah en cours'),
              body: tr('Dans le lecteur, touchez un ayah puis « En cours » pour le retrouver ici.'),
            ),
            subtitle: (p) => tr('En cours · {t}', {'t': since(p.updatedAt)}),
            action: (p) => IconButton.filledTonal(
              tooltip: tr('Marquer appris'),
              onPressed: () => store.setStatus(p.surah, p.ayah, AyahStatus.memorized),
              icon: const Icon(Icons.done),
            ),
          ),
        ]),
      ),
    );
  }
}

class _List extends StatelessWidget {
  const _List({required this.items, required this.repo, required this.empty, required this.subtitle, required this.action});
  final List<AyahProgress> items;
  final QuranRepository repo;
  final Widget empty;
  final String Function(AyahProgress) subtitle;
  final Widget Function(AyahProgress) action;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return empty;
    return Constrained(
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final p = items[i];
          final s = repo.surah(p.surah);
          return Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: p.surah, initialAyah: p.ayah))),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 10, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    KhatamBadge(label: arabicDigits(p.ayah), size: 30),
                    const SizedBox(width: 8),
                    Expanded(child: Text('${s.name} · ${p.surah}:${p.ayah}', style: context.text.titleSmall, textDirection: TextDirection.rtl, textAlign: TextAlign.left)),
                    action(p),
                  ]),
                  ArabicText(s.ayahs[p.ayah - 1], size: 22, height: 1.9),
                  Text(subtitle(p), style: TextStyle(fontSize: 12.5, color: context.tones.muted)),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }
}
