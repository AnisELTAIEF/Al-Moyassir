import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/khatam.dart';
import '../widgets/surah_actions.dart';
import 'reader_screen.dart';

/// Les 30 juz et 60 hizb du mushaf de Qalun, avec leur progression et le marquage en bloc.
class JuzListView extends StatelessWidget {
  const JuzListView({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    final div = repo.divisions;
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      itemCount: Divisions.juzCount,
      itemBuilder: (context, i) {
        final j = i + 1;
        final juzRefs = div.ayahsOfJuz(j);
        final (jm, _) = store.countIn(juzRefs);
        final complete = jm == juzRefs.length;
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: Column(children: [
            ListTile(
              contentPadding: const EdgeInsetsDirectional.fromSTEB(16, 4, 4, 0),
              title: Row(children: [
                Text(divisionName(juz: j), style: context.text.titleMedium),
                if (!I18n.isAr) ...[
                  const SizedBox(width: 10),
                  Text('الجزء ${arabicDigits(j)}', style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 18, color: context.tones.muted, height: 1.4)),
                ],
              ]),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 6),
                child: Row(children: [
                  Expanded(child: ThinBar(value: jm / juzRefs.length, color: complete ? context.tones.gold : null, height: 5)),
                  const SizedBox(width: 10),
                  Text(pct(jm, juzRefs.length), style: TextStyle(fontSize: 12.5, color: context.tones.muted)),
                ]),
              ),
              trailing: _MarkButton(complete: complete, title: divisionName(juz: j), refs: juzRefs, subtitle: _from(context, repo, div.juzStart(j))),
            ),
            for (final h in [2 * j - 1, 2 * j]) _HizbRow(hizb: h),
            const SizedBox(height: 6),
          ]),
        );
      },
    );
  }
}

String _from(BuildContext context, QuranRepository repo, AyahRef r) =>
    tr('Depuis {surah} {ayah}', {'surah': repo.surah(r.$1).name, 'ayah': r.$2});

class _HizbRow extends StatelessWidget {
  const _HizbRow({required this.hizb});
  final int hizb;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    final refs = repo.divisions.ayahsOfHizb(hizb);
    final (m, _) = store.countIn(refs);
    final complete = m == refs.length;
    final start = repo.divisions.hizbStart(hizb);
    final title = divisionName(hizb: hizb);
    final firstWords = repo.surah(start.$1).ayahs[start.$2 - 1].split(' ').take(3).join(' ');
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: start.$1, initialAyah: start.$2))),
      onLongPress: () => showRangeMenu(context, title: title, subtitle: _from(context, repo, start), refs: refs),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 6, 4, 6),
        child: Row(children: [
          KhatamBadge(
            label: '$hizb',
            size: 38,
            fill: complete ? context.tones.gold : null,
            stroke: complete ? context.tones.gold : context.colors.primary.withValues(alpha: 0.5),
            textColor: complete ? Palette.ink : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(firstWords, textDirection: TextDirection.rtl, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 20, height: 1.5)),
              Text(
                tr('{from} · {m}/{n} appris', {'from': _from(context, repo, start), 'm': m, 'n': refs.length}),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: context.tones.muted),
              ),
              if (m > 0 && !complete) ...[const SizedBox(height: 4), ThinBar(value: m / refs.length, height: 3)],
            ]),
          ),
          _MarkButton(complete: complete, title: title, refs: refs, subtitle: _from(context, repo, start)),
        ]),
      ),
    );
  }
}

/// ✓ : marque tout comme appris ; si c'est déjà le cas, ouvre le menu (en cours / retirer).
class _MarkButton extends StatelessWidget {
  const _MarkButton({required this.complete, required this.title, required this.refs, required this.subtitle});
  final bool complete;
  final String title, subtitle;
  final List<AyahRef> refs;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          tooltip: complete ? tr('Appris — options') : tr('Marquer tout comme appris'),
          iconSize: 26,
          onPressed: () => complete
              ? showRangeMenu(context, title: title, subtitle: subtitle, refs: refs)
              : setAyahRange(context, title, refs, AyahStatus.memorized),
          icon: Icon(complete ? Icons.check_circle : Icons.check_circle_outline,
              color: complete ? context.tones.gold : context.tones.muted.withValues(alpha: 0.55)),
        ),
        IconButton(
          tooltip: tr('Plus d’actions'),
          onPressed: () => showRangeMenu(context, title: title, subtitle: subtitle, refs: refs),
          icon: Icon(Icons.more_vert, color: context.tones.muted),
        ),
      ]);
}
