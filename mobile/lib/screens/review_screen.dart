import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'reader_screen.dart';

/// Un passage : ayat consécutifs d'une même sourate, révisés ensemble (on révise par passages,
/// pas ayah par ayah).
class Passage {
  Passage(this.surah, this.items);
  final int surah;
  final List<AyahProgress> items;
  int get from => items.first.ayah;
  int get to => items.last.ayah;
  int get length => items.length;
}

/// Regroupe des ayat en passages (même sourate, numéros consécutifs), dans l'ordre du Coran.
List<Passage> groupPassages(Iterable<AyahProgress> ayat) {
  final sorted = [...ayat]..sort((a, b) => a.surah != b.surah ? a.surah.compareTo(b.surah) : a.ayah.compareTo(b.ayah));
  final out = <Passage>[];
  for (final p in sorted) {
    final last = out.isEmpty ? null : out.last;
    if (last != null && last.surah == p.surah && last.to + 1 == p.ayah) {
      last.items.add(p);
    } else {
      out.add(Passage(p.surah, [p]));
    }
  }
  return out;
}

/// Ouvre le mushaf sur un ayah, en vue combinée : fond = validation de l'enseignant, médaillon = marques de l'élève.
void openWithTeacherMarks(BuildContext context, int surah, int ayah) {
  final settings = context.read<Settings>();
  settings.readingMode = ReadingMode.mushaf;
  settings.setColoringIn(ReadingMode.mushaf, AyahColoring.validation);
  Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: surah, initialAyah: ayah)));
}

/// Passages (sourate, premier et dernier ayah) à partir d'ayat triés dans l'ordre du Coran.
List<(int, int, int)> passagesOfRefs(List<(int, int)> refs) {
  final out = <(int, int, int)>[];
  for (final (s, a) in refs) {
    if (out.isNotEmpty && out.last.$1 == s && out.last.$3 + 1 == a) {
      out.last = (s, out.last.$2, a);
    } else {
      out.add((s, a, a));
    }
  }
  return out;
}

/// Date à laquelle un ayah appris doit être révisé : 3 jours après l'avoir appris, puis 7 jours
/// après chaque révision (même règle que [AyahProgress.isDue]).
DateTime nextReviewOf(AyahProgress p) {
  final ref = p.lastReviewedAt ?? p.memorizedAt ?? p.updatedAt;
  return ref.add(Duration(days: p.lastReviewedAt == null ? 3 : 7));
}

/// Révision (المراجعة) : revenir régulièrement sur ce qu'on a appris pour ne pas l'oublier.
class ReviewScreen extends StatelessWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<ProgressStore>();
    final validations = context.watch<ValidationStore>();
    final repo = context.read<QuranRepository>();
    final now = DateTime.now();
    // Demandé par l'enseignant : pages à reprendre et ayat « à revoir » (ils s'ajoutent aux marques personnelles).
    final retakePages = validations.retakePages;
    final teacherPassages = passagesOfRefs(validations.reviewAyat);
    final teacherAyat = validations.reviewAyat.length + retakePages.fold<int>(0, (n, p) => n + repo.ayahsOfMushafPage(p).length);
    final hasTeacher = retakePages.isNotEmpty || teacherPassages.isNotEmpty;
    final memorized = store.all.where((p) => p.status == AyahStatus.memorized).toList();
    final due = memorized.where((p) => p.needsReview || p.isDue(now)).toList();
    final learning = store.all.where((p) => p.status == AyahStatus.learning).toList();

    final duePassages = groupPassages(due)..sort((a, b) => _oldest(a).compareTo(_oldest(b))); // le plus en retard d'abord
    final learningPassages = groupPassages(learning);
    final allPassages = groupPassages(memorized);

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Révision · المراجعة')),
          actions: [
            if (store.syncing)
              const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))
            else
              IconButton(
                  tooltip: tr('Synchroniser'),
                  onPressed: () {
                    store.sync();
                    validations.refresh();
                  },
                  icon: const Icon(Icons.sync)),
          ],
          bottom: TabBar(tabs: [
            Tab(text: tr('À réviser ({n})', {'n': due.length + teacherAyat})),
            Tab(text: tr('En cours ({n})', {'n': learning.length})),
            Tab(text: tr('Acquis ({n})', {'n': memorized.length})),
          ]),
        ),
        body: TabBarView(children: [
          _PassageList(
            header: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (hasTeacher) _TeacherSection(retakePages: retakePages, passages: teacherPassages),
              const _HowItWorks(),
            ]),
            passages: duePassages,
            empty: hasTeacher
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(tr('Aucune révision personnelle aujourd’hui.'), textAlign: TextAlign.center, style: TextStyle(color: context.tones.muted)),
                  )
                : EmptyState(
              icon: Icons.check_circle_outline,
              title: tr('Rien à réviser aujourd’hui'),
              body: memorized.isEmpty
                  ? tr('Quand vous marquez des ayat « Acquis », ils reviennent ici au bon moment pour les réviser.')
                  : tr('Bravo, vos révisions sont à jour. Prochaine révision : {d}.',
                      {'d': _when(memorized.map(nextReviewOf).reduce((a, b) => a.isBefore(b) ? a : b), now)}),
            ),
            status: (g) => _dueLabel(g, now),
            urgent: true,
            actionLabel: tr('J’ai révisé'),
            actionIcon: Icons.check,
            onAction: (context, g) => _markReviewed(context, store, g),
          ),
          _PassageList(
            passages: learningPassages,
            empty: EmptyState(
              icon: Icons.timelapse,
              title: tr('Aucun ayah en cours de mémorisation'),
              body: tr('Dans le lecteur, touchez un ayah pour le marquer « En cours » : il apparaîtra ici jusqu’à ce que vous le sachiez par cœur.'),
            ),
            status: (g) => tr('En cours de mémorisation'),
            actionLabel: tr('Je le sais'),
            actionIcon: Icons.done_all,
            onAction: (context, g) => _setAcquired(context, store, g),
          ),
          _PassageList(
            passages: allPassages,
            empty: EmptyState(
              icon: Icons.menu_book_outlined,
              title: tr('Aucun ayah acquis pour l’instant'),
              body: tr('Les passages que vous savez par cœur s’afficheront ici avec leur prochaine date de révision.'),
            ),
            status: (g) => _nextLabel(g, now),
          ),
        ]),
      ),
    );
  }

  static DateTime _oldest(Passage g) => g.items.map(nextReviewOf).reduce((a, b) => a.isBefore(b) ? a : b);

  static DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

  static String _when(DateTime d, DateTime now) {
    final days = _day(d).difference(_day(now)).inDays;
    if (days <= 0) return tr('aujourd’hui');
    if (days == 1) return tr('demain');
    return tr('dans {n} jours', {'n': days});
  }

  static String _dueLabel(Passage g, DateTime now) {
    if (g.items.any((p) => p.needsReview)) return tr('Marqué « à revoir »');
    final late = _day(now).difference(_day(_oldest(g))).inDays;
    return late <= 0 ? tr('À réviser aujourd’hui') : tr('En retard de {n} j', {'n': late});
  }

  static String _nextLabel(Passage g, DateTime now) {
    if (g.items.any((p) => p.needsReview || p.isDue(now))) return tr('À réviser maintenant');
    return tr('Prochaine révision : {d}', {'d': _when(_oldest(g), now)});
  }

  static Future<void> _markReviewed(BuildContext context, ProgressStore store, Passage g) async {
    final before = store.snapshotAyahs([for (final p in g.items) (p.surah, p.ayah)]);
    final settings = context.read<Settings>();
    for (final p in g.items) {
      await store.markReviewed(p.surah, p.ayah);
    }
    settings.saveActivity(Activity.review, g.surah, g.from);
    if (!context.mounted) return;
    snack(context, tr('Révision enregistrée ({n} ayat). Prochaine dans 7 jours.', {'n': g.length}),
        action: SnackBarAction(label: tr('Annuler'), onPressed: () => store.restoreAyahs(before)));
  }

  static Future<void> _setAcquired(BuildContext context, ProgressStore store, Passage g) async {
    final before = store.snapshotAyahs([for (final p in g.items) (p.surah, p.ayah)]);
    await store.setRange(g.surah, [for (final p in g.items) p.ayah], AyahStatus.memorized);
    if (!context.mounted) return;
    snack(context, tr('{n} ayat acquis : première révision dans 3 jours.', {'n': g.length}),
        action: SnackBarAction(label: tr('Annuler'), onPressed: () => store.restoreAyahs(before)));
  }
}

/// « Demandé par l'enseignant » : pages à reprendre et ayat à revoir, en tête de la liste « À réviser ».
/// L'élève ne peut pas les effacer (seul l'enseignant le fait, après l'avoir réentendu) : un toucher ouvre le mushaf
/// en vue combinée, où il voit aussi ses propres marques.
class _TeacherSection extends StatelessWidget {
  const _TeacherSection({required this.retakePages, required this.passages});
  final List<int> retakePages;
  final List<(int, int, int)> passages;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final red = context.tones.red;
    Widget card({required IconData icon, required Widget title, required String subtitle, required VoidCallback onTap}) => Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: Icon(icon, color: red),
            title: title,
            subtitle: Text(subtitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: onTap,
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 2),
        child: Row(children: [
          Icon(Icons.school_outlined, size: 20, color: red),
          const SizedBox(width: 8),
          Expanded(child: Text(tr('Demandé par votre enseignant'), style: context.text.titleSmall?.copyWith(color: red))),
        ]),
      ),
      for (final p in retakePages)
        card(
          icon: Icons.replay,
          title: Text(tr('Page {n} à reprendre', {'n': p}), style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: tr('سورة {s} · depuis l’ayah {a} — trop d’erreurs sur la page',
              {'s': repo.surah(repo.mushafPages[p - 1].$1).name, 'a': repo.mushafPages[p - 1].$2}),
          onTap: () => openWithTeacherMarks(context, repo.mushafPages[p - 1].$1, repo.mushafPages[p - 1].$2),
        ),
      for (final (s, from, to) in passages)
        card(
          icon: Icons.rate_review_outlined,
          title: ArabicText('سُورَةُ ${repo.surah(s).name}', size: 19, height: 1.4),
          subtitle: '${from == to ? tr('ayah {a}', {'a': from}) : tr('ayat {a}–{b}', {'a': from, 'b': to})} · ${tr('à revoir')}',
          onTap: () => openWithTeacherMarks(context, s, from),
        ),
      const SizedBox(height: 8),
    ]);
  }
}

/// Explication courte de la révision (ouverte par défaut, repliable).
class _HowItWorks extends StatelessWidget {
  const _HowItWorks();

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(color: context.tones.muted, height: 1.45);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: context.colors.primary.withValues(alpha: 0.06),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: true,
          leading: Icon(Icons.lightbulb_outline, color: context.colors.primary),
          title: Text(tr('Comment fonctionne la révision ?'), style: context.text.titleSmall),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('Ce qu’on a appris par cœur s’oublie si on ne le répète pas. L’app vous ramène ici chaque passage « Acquis » au bon moment :'), style: muted),
            const SizedBox(height: 6),
            Text(tr('• 3 jours après l’avoir appris ;\n• puis 7 jours après chaque révision.'), style: muted),
            const SizedBox(height: 6),
            Text(tr('Récitez le passage de mémoire (touchez-le pour l’ouvrir, l’écouter ou vérifier), puis touchez « J’ai révisé ».'), style: muted),
          ],
        ),
      ),
    );
  }
}

class _PassageList extends StatelessWidget {
  const _PassageList({
    required this.passages,
    required this.empty,
    required this.status,
    this.header,
    this.urgent = false,
    this.actionLabel,
    this.actionIcon,
    this.onAction,
  });
  final List<Passage> passages;
  final Widget empty;
  final Widget? header;
  final String Function(Passage) status;
  final bool urgent;
  final String? actionLabel;
  final IconData? actionIcon;
  final Future<void> Function(BuildContext, Passage)? onAction;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    return Constrained(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          ?header,
          if (passages.isEmpty) empty,
          for (final g in passages) ...[
            _PassageCard(
              passage: g,
              surahName: repo.surah(g.surah).name,
              firstAyah: repo.surah(g.surah).ayahs[g.from - 1],
              status: status(g),
              urgent: urgent,
              actionLabel: actionLabel,
              actionIcon: actionIcon,
              onAction: onAction == null ? null : () => onAction!(context, g),
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _PassageCard extends StatelessWidget {
  const _PassageCard({
    required this.passage,
    required this.surahName,
    required this.firstAyah,
    required this.status,
    required this.urgent,
    this.actionLabel,
    this.actionIcon,
    this.onAction,
  });
  final Passage passage;
  final String surahName, firstAyah, status;
  final bool urgent;
  final String? actionLabel;
  final IconData? actionIcon;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final g = passage;
    final range = g.length == 1 ? tr('ayah {a}', {'a': g.from}) : tr('ayat {a}–{b}', {'a': g.from, 'b': g.to});
    final color = urgent ? context.tones.red : context.tones.muted;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: g.surah, initialAyah: g.from))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ArabicText('سُورَةُ $surahName', size: 21, height: 1.4),
                  Text('$range · ${tr('{n} ayat', {'n': g.length})}', style: context.text.bodySmall),
                ]),
              ),
              if (onAction != null) FilledButton.tonalIcon(onPressed: onAction, icon: Icon(actionIcon, size: 18), label: Text(actionLabel!)),
            ]),
            const SizedBox(height: 6),
            // Début du passage (une ligne), pour le reconnaître d'un coup d'œil.
            Text(firstAyah,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textDirection: TextDirection.rtl,
                style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 19, height: 1.7, color: context.tones.muted)),
            Row(children: [
              Icon(urgent ? Icons.schedule : Icons.event_available, size: 15, color: color),
              const SizedBox(width: 6),
              Expanded(child: Text(status, style: TextStyle(fontSize: 12.5, color: color))),
            ]),
          ]),
        ),
      ),
    );
  }
}
