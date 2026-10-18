import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/khatam.dart';
import '../widgets/surah_actions.dart';
import 'reader_screen.dart';

/// Les 604 pages du mushaf de Qalun, avec leur progression et le marquage page par page.
/// S'ouvre sur la page de la dernière lecture ; un champ permet d'aller directement à un numéro.
class PagesListView extends StatefulWidget {
  const PagesListView({super.key});

  @override
  State<PagesListView> createState() => _PagesListViewState();
}

class _PagesListViewState extends State<PagesListView> {
  static const _rowHeight = 76.0;
  late final QuranRepository _repo = context.read<QuranRepository>();
  late final ScrollController _scroll = ScrollController(initialScrollOffset: (_startPage() - 1) * _rowHeight);

  int _startPage() {
    final last = context.read<Settings>().lastRead;
    return last == null ? 1 : _repo.mushafPageOf(last.$1, last.$2);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _goTo(String text) {
    final n = int.tryParse(text.trim());
    if (n == null || n < 1 || n > _repo.mushafPages.length || !_scroll.hasClients) return;
    _scroll.animateTo(
      ((n - 1) * _rowHeight).clamp(0.0, _scroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
        child: TextField(
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: '${tr('Aller à la page…')} (1–604)', isDense: true),
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.go,
          onSubmitted: _goTo,
        ),
      ),
      Expanded(
        child: ListView.builder(
          controller: _scroll,
          itemExtent: _rowHeight,
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _repo.mushafPages.length,
          itemBuilder: (context, i) => _PageRow(page: i + 1),
        ),
      ),
    ]);
  }
}

class _PageRow extends StatelessWidget {
  const _PageRow({required this.page});
  final int page;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    final refs = repo.ayahsOfMushafPage(page);
    final (m, _) = store.countIn(refs);
    final complete = m == refs.length;
    final start = refs.first;
    final title = tr('Page {n}', {'n': page});
    final from = tr('Depuis {surah} {ayah}', {'surah': repo.surah(start.$1).name, 'ayah': start.$2});
    final firstWords = repo.surah(start.$1).ayahs[start.$2 - 1].split(' ').take(3).join(' ');
    final tones = context.tones;

    return InkWell(
      onTap: () {
        // Une page s'ouvre en lecture par pages (Qira'a), pas ayah par ayah.
        context.read<Settings>().readingMode = ReadingMode.mushaf;
        Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: start.$1, initialAyah: start.$2)));
      },
      onLongPress: () => showRangeMenu(context, title: title, subtitle: from, refs: refs),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 6, 4, 6),
        child: Row(children: [
          KhatamBadge(
            label: '$page',
            size: 42,
            fill: complete ? tones.gold : null,
            stroke: complete ? tones.gold : context.colors.primary.withValues(alpha: 0.5),
            textColor: complete ? Palette.ink : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(firstWords,
                  textDirection: TextDirection.rtl,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 20, height: 1.5)),
              Text(
                tr('{from} · {m}/{n} appris', {'from': from, 'm': m, 'n': refs.length}),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: tones.muted),
              ),
              if (m > 0 && !complete) ...[const SizedBox(height: 4), ThinBar(value: m / refs.length, height: 3)],
            ]),
          ),
          IconButton(
            tooltip: complete ? tr('Appris — options') : tr('Marquer tout comme appris'),
            iconSize: 26,
            onPressed: () => complete
                ? showRangeMenu(context, title: title, subtitle: from, refs: refs)
                : setAyahRange(context, title, refs, AyahStatus.memorized),
            icon: Icon(complete ? Icons.check_circle : Icons.check_circle_outline,
                color: complete ? tones.gold : tones.muted.withValues(alpha: 0.55)),
          ),
        ]),
      ),
    );
  }
}
