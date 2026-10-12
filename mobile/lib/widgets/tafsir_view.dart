import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/tafsir.dart';
import '../theme.dart';

/// Section repliable « Tafsir Ibn Kathir » de la feuille d'un ayah.
class AyahTafsirSection extends StatelessWidget {
  const AyahTafsirSection({super.key, required this.surah, required this.ayah});
  final int surah, ayah;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 8),
        leading: Icon(Icons.menu_book_outlined, color: context.colors.primary),
        title: Text(tr('Tafsir Ibn Kathir'), style: context.text.titleSmall),
        subtitle: Text(tr('Une ou deux explications, les plus proches de l’ayah'), style: context.text.bodySmall),
        children: [TafsirBody(surah: surah, ayah: ayah)],
      ),
    );
  }
}

/// Explications d'Ibn Kathir pour un ayah (chargées à la première ouverture).
class TafsirBody extends StatelessWidget {
  const TafsirBody({super.key, required this.surah, required this.ayah});
  final int surah, ayah;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<TafsirRepository>(
      future: TafsirRepository.load(),
      builder: (context, snap) {
        if (snap.hasError) return Text(tr('Tafsir indisponible.'), style: TextStyle(color: context.colors.error));
        if (!snap.hasData) return const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()));
        final e = snap.data!.of(surah, ayah);
        if (e == null || e.extracts.isEmpty) return Text(tr('Pas d’explication disponible pour cet ayah.'));
        final hafs = e.hafsAyahs;
        final sameNumber = hafs.length == 1 && hafs.first == ayah;
        final ref = hafs.length == 1 ? '$surah:${hafs.first}' : '$surah:${hafs.first}–${hafs.last}';
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (final (i, t) in e.extracts.indexed)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: BoxDecoration(
                color: context.colors.primary.withValues(alpha: 0.06),
                border: BorderDirectional(start: BorderSide(color: context.tones.gold, width: 3)),
              ),
              child: Text(
                e.extracts.length > 1 ? '${i + 1}. $t' : t,
                textDirection: TextDirection.rtl,
                textAlign: TextAlign.justify,
                style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 19, height: 1.75, color: context.colors.onSurface),
              ),
            ),
          Text(
            sameNumber
                ? tr('Extrait(s) du tafsir d’Ibn Kathir, choisi(s) automatiquement et recopié(s) sans modification. Texte intégral : quran.com.')
                : tr('Extrait(s) du tafsir d’Ibn Kathir, choisi(s) automatiquement et recopié(s) sans modification. Le tafsir suit la numérotation de Hafs : {ref}. Texte intégral : quran.com.',
                    {'ref': ref}),
            style: context.text.bodySmall?.copyWith(color: context.tones.muted),
          ),
        ]);
      },
    );
  }
}
