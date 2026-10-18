import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/khatam.dart';
import '../widgets/surah_actions.dart';
import 'juz_list_view.dart';
import 'pages_list_view.dart';
import 'reader_screen.dart';
import '../core/i18n.dart';

enum _Filter { all, learning, done }

class SurahListScreen extends StatefulWidget {
  const SurahListScreen({super.key});
  @override
  State<SurahListScreen> createState() => _SurahListScreenState();
}

class _SurahListScreenState extends State<SurahListScreen> {
  String _query = '';
  _Filter _filter = _Filter.all;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    final per = store.memorizedPerSurah();
    final q = _query.trim();
    final list = repo.surahs.where((s) {
      if (q.isNotEmpty && s.number.toString() != q && !s.name.contains(q) && !_plain(s.name).contains(_plain(q))) return false;
      final m = per[s.number];
      return switch (_filter) {
        _Filter.all => true,
        _Filter.learning => store.trackedIn(s.number) > 0 && m < s.ayahCount,
        _Filter.done => m == s.ayahCount,
      };
    }).toList();

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Lire')),
          bottom: TabBar(tabs: [Tab(text: tr('Pages')), Tab(text: tr('Sourates')), Tab(text: tr('Juz et hizb'))]),
        ),
        // Pages en premier : c'est la vue par défaut (lecture et validation se font à la page).
        body: TabBarView(children: [const Constrained(child: PagesListView()), _surahs(list, per, store), const Constrained(child: JuzListView())]),
      ),
    );
  }

  Widget _surahs(List<Surah> list, List<int> per, ProgressStore store) {
    return Constrained(
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Column(children: [
                TextField(
                  decoration: InputDecoration(prefixIcon: Icon(Icons.search), hintText: tr('Numéro ou nom (en arabe)'), isDense: true),
                  onChanged: (v) => setState(() => _query = v),
                ),
                SizedBox(height: 10),
                SegmentedButton<_Filter>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: _Filter.all, label: Text(tr('Toutes'))),
                    ButtonSegment(value: _Filter.learning, label: Text(tr('En cours'))),
                    ButtonSegment(value: _Filter.done, label: Text(tr('Apprises'))),
                  ],
                  selected: {_filter},
                  onSelectionChanged: (s) => setState(() => _filter = s.first),
                ),
              ]),
            ),
          ),
          if (list.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.menu_book_outlined,
                title: _filter == _Filter.done ? tr('Aucune sourate complète pour l’instant') : tr('Aucune sourate trouvée'),
                body: _filter == _Filter.done ? tr('Touchez ✓ à droite d’une sourate pour la marquer apprise en entier.') : null,
              ),
            ),
          SliverList.builder(
            itemCount: list.length,
            itemBuilder: (context, i) => _SurahRow(surah: list[i], memorized: per[list[i].number], tracked: store.trackedIn(list[i].number)),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ]),
    );
  }

  /// Comparaison sans voyelles ni signes coraniques.
  static String _plain(String s) => s.replaceAll(RegExp('[ً-ٰٟۖ-ۭ]'), '');
}

class _SurahRow extends StatelessWidget {
  const _SurahRow({required this.surah, required this.memorized, required this.tracked});
  final Surah surah;
  final int memorized;
  final int tracked;

  @override
  Widget build(BuildContext context) {
    final complete = memorized == surah.ayahCount;
    final tones = context.tones;
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: surah.number))),
      onLongPress: () => showSurahMenu(context, surah.number),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Row(children: [
          KhatamBadge(
            label: '${surah.number}',
            size: 44,
            fill: complete ? tones.gold : null,
            stroke: complete ? tones.gold : context.colors.primary.withValues(alpha: 0.6),
            textColor: complete ? Palette.ink : null,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Align(alignment: AlignmentDirectional.centerStart, child: ArabicText(surah.name, size: 24, height: 1.5)),
              Text(
                tracked == 0 ? tr('{n} ayat', {'n': surah.ayahCount}) : tr('{n} ayat · {m} appris', {'n': surah.ayahCount, 'm': memorized}),
                style: TextStyle(fontSize: 13, color: tones.muted),
              ),
              if (tracked > 0 && !complete) ...[const SizedBox(height: 6), ThinBar(value: memorized / surah.ayahCount, height: 4)],
            ]),
          ),
          IconButton(
            tooltip: complete ? tr('Sourate apprise — options') : tr('Marquer toute la sourate comme apprise'),
            iconSize: 28,
            onPressed: () => complete ? showSurahMenu(context, surah.number) : setWholeSurah(context, surah.number, AyahStatus.memorized),
            icon: Icon(complete ? Icons.check_circle : Icons.check_circle_outline, color: complete ? tones.gold : tones.muted.withValues(alpha: 0.55)),
          ),
          IconButton(
            tooltip: tr('Plus d’actions'),
            onPressed: () => showSurahMenu(context, surah.number),
            icon: Icon(Icons.more_vert, color: tones.muted),
          ),
        ]),
      ),
    );
  }
}
