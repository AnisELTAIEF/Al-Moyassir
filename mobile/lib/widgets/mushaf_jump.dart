import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import 'khatam.dart';

/// Sans les voyelles ni les signes de lecture : « البقرة » trouve « البَقَرَة ».
String _bare(String s) => s.replaceAll(RegExp('[ً-ٰٟۖ-ۭـ]'), '').replaceAll(RegExp('[أإآٱ]'), 'ا');

/// « Aller à… » du mushaf : un numéro de page, une sourate (recherche par nom ou numéro) ou un juz.
/// Renvoie le premier ayah choisi, ou null.
Future<AyahRef?> showMushafJump(BuildContext context, {required int currentPage}) => showModalBottomSheet<AyahRef>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _JumpSheet(currentPage: currentPage),
    );

class _JumpSheet extends StatefulWidget {
  const _JumpSheet({required this.currentPage});
  final int currentPage;

  @override
  State<_JumpSheet> createState() => _JumpSheetState();
}

class _JumpSheetState extends State<_JumpSheet> {
  late final QuranRepository _repo = context.read<QuranRepository>();
  late final _page = TextEditingController(text: '${widget.currentPage}');
  String _query = '';

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  void _openPage() {
    final n = int.tryParse(_page.text.trim());
    if (n == null || n < 1 || n > _repo.mushafPages.length) return;
    Navigator.pop(context, _repo.mushafPages[n - 1]);
  }

  @override
  Widget build(BuildContext context) {
    final q = _bare(_query.trim());
    final surahs = [
      for (final s in _repo.surahs)
        if (q.isEmpty || '${s.number}' == q || _bare(s.name).contains(q)) s,
    ];
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.85,
      child: DefaultTabController(
        length: 2,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _page,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.go,
                  onSubmitted: (_) => _openPage(),
                  decoration: InputDecoration(
                    isDense: true,
                    labelText: tr('Page'),
                    helperText: tr('De 1 à {n}', {'n': _repo.mushafPages.length}),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              FilledButton(onPressed: _openPage, child: Text(tr('Ouvrir'))),
            ]),
          ),
          TabBar(tabs: [Tab(text: tr('Sourates')), Tab(text: tr('Juz'))]),
          Expanded(
            child: TabBarView(children: [
              Column(children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v),
                    decoration: InputDecoration(isDense: true, prefixIcon: const Icon(Icons.search), hintText: tr('Nom ou numéro de la sourate')),
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: surahs.length,
                    itemBuilder: (context, i) {
                      final s = surahs[i];
                      return ListTile(
                        leading: KhatamBadge(label: arabicDigits(s.number), size: 36, stroke: context.tones.gold, textColor: context.colors.onSurface),
                        title: Text(s.name, style: const TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 20)),
                        subtitle: Text(tr('{n} ayat', {'n': s.ayahCount})),
                        trailing: Text(tr('Page {n}', {'n': _repo.mushafPageOf(s.number, 1)}), style: TextStyle(color: context.tones.muted)),
                        onTap: () => Navigator.pop(context, (s.number, 1)),
                      );
                    },
                  ),
                ),
              ]),
              GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 76, mainAxisSpacing: 8, crossAxisSpacing: 8),
                itemCount: Divisions.juzCount,
                itemBuilder: (context, i) {
                  final start = _repo.divisions.juzStart(i + 1);
                  return OutlinedButton(
                    style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                    onPressed: () => Navigator.pop(context, start),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('${i + 1}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                      Text('p. ${_repo.mushafPageOf(start.$1, start.$2)}', style: TextStyle(fontSize: 11, color: context.tones.muted)),
                    ]),
                  );
                },
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
