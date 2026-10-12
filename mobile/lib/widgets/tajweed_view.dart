import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../core/tajweed.dart';
import '../theme.dart';
import 'common.dart';
import '../core/i18n.dart';

final _cache = <String, List<TajweedSegment>>{};

/// Segments de tajwid d'un ayah (mis en cache : le calcul est fait une seule fois par ayah).
List<TajweedSegment> segmentsFor(String text, {required bool isFirstAyahs}) =>
    _cache.putIfAbsent('${isFirstAyahs ? 1 : 0}$text', () => tajweedSegments(text, isFirstAyahs: isFirstAyahs));

/// Texte d'un ayah, colorié selon le tajwid si [enabled].
List<InlineSpan> tajweedSpans(BuildContext context, String text, {required bool enabled, required bool isFirstAyahs}) {
  if (!enabled) return [TextSpan(text: text)];
  final b = Theme.of(context).brightness;
  return [
    for (final s in segmentsFor(text, isFirstAyahs: isFirstAyahs))
      TextSpan(text: s.text, style: s.rule == null ? null : TextStyle(color: s.rule!.color(b))),
  ];
}

/// Pastille de couleur d'une règle.
class RuleDot extends StatelessWidget {
  const RuleDot(this.rule, {super.key, this.size = 14});
  final TajweedRule rule;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: rule.color(Theme.of(context).brightness), shape: BoxShape.circle),
      );
}

/// Une règle : couleur, nom, exemple éventuel et explication.
class RuleTile extends StatelessWidget {
  const RuleTile(this.rule, {super.key, this.example});
  final TajweedRule rule;
  final List<TajweedSegment>? example;

  @override
  Widget build(BuildContext context) {
    final color = rule.color(Theme.of(context).brightness);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 10), child: RuleDot(rule)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 10, children: [
              Text(rule.label, style: context.text.titleSmall?.copyWith(color: rule.labelColor(Theme.of(context).brightness), fontWeight: FontWeight.w700)),
              if (!I18n.isAr)
                Text(rule.arabic, textDirection: TextDirection.rtl, style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 18, color: context.tones.muted, height: 1.9)),
            ]),
            if (example != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text.rich(
                  TextSpan(children: [
                    for (final s in example!) TextSpan(text: s.text, style: s.rule == null ? null : TextStyle(color: color)),
                  ]),
                  textDirection: TextDirection.rtl,
                  style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 26, height: 1.6, color: context.colors.onSurface),
                ),
              ),
            Text(rule.info, style: TextStyle(fontSize: 13.5, color: context.tones.muted, height: 1.35)),
          ]),
        ),
      ]),
    );
  }
}

/// Feuille « Légende du tajwid ».
Future<void> showTajweedLegend(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (c) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (c, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Text(tr('Légende du tajwid'), style: c.text.titleLarge),
            const SizedBox(height: 4),
            Text(
              tr('Touchez un ayah pour voir les règles qu’il contient. Les couleurs sont déduites des signes du mushaf de Qalun (Awqaf libyens) ; quand Qalun admet plusieurs options, l’explication le précise : suivez celle de votre enseignant.'),
              style: TextStyle(color: c.tones.muted),
            ),
            SectionTitle(tr('Règles générales')),
            for (final r in TajweedRule.values.where((r) => !r.qalun)) RuleTile(r),
            SectionTitle(tr('Spécificités de Qalun')),
            for (final r in TajweedRule.values.where((r) => r.qalun)) RuleTile(r),
          ],
        ),
      ),
    );

/// Résumé des règles d'un ayah, pour la feuille d'actions.
class AyahTajweedSection extends StatelessWidget {
  const AyahTajweedSection({super.key, required this.text, required this.isFirstAyahs});
  final String text;
  final bool isFirstAyahs;

  @override
  Widget build(BuildContext context) {
    final found = tajweedSummary(text, isFirstAyahs: isFirstAyahs);
    if (found.isEmpty) return const SizedBox.shrink();
    final rules = TajweedRule.values.where(found.containsKey).toList();
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: Text(tr('Tajwid dans cet ayah · touchez pour les explications'), style: context.text.labelLarge?.copyWith(color: context.tones.muted)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Wrap(spacing: 12, runSpacing: 4, children: [
            for (final r in rules)
              Row(mainAxisSize: MainAxisSize.min, children: [
                RuleDot(r, size: 10),
                const SizedBox(width: 5),
                Text(r.label, style: TextStyle(fontSize: 12.5, color: r.labelColor(Theme.of(context).brightness), fontWeight: FontWeight.w600)),
              ]),
          ]),
        ),
        children: [
          for (final r in rules) RuleTile(r, example: found[r]),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(onPressed: () => showTajweedLegend(context), child: Text(tr('Toutes les règles'))),
          ),
        ],
      ),
    );
  }
}

/// Texte d'un ayah prêt à afficher : tajwid (si [tajweed]), marqueur ۞ de huitième de hizb
/// inséré devant le mot n° [markerWord], geste et surlignage éventuels sur chaque morceau.
List<InlineSpan> ayahSpans(
  BuildContext context,
  String text, {
  required bool tajweed,
  required bool isFirstAyahs,
  int? markerWord,
  GestureRecognizer? recognizer,
  Color? background,
}) {
  final b = Theme.of(context).brightness;
  final segs = tajweed ? segmentsFor(text, isFirstAyahs: isFirstAyahs) : [TajweedSegment(text, null)];
  int? cut;
  if (markerWord != null) {
    var w = 1, i = 0;
    while (w < markerWord && i < text.length) {
      if (text[i] == ' ') w++;
      i++;
    }
    cut = i;
  }
  TextSpan span(String t, TajweedRule? r) => TextSpan(
        text: t,
        recognizer: recognizer,
        style: r == null && background == null ? null : TextStyle(color: r?.color(b), backgroundColor: background),
      );
  final marker = TextSpan(text: '۞ ', recognizer: recognizer, style: TextStyle(color: context.tones.gold, backgroundColor: background));
  final out = <InlineSpan>[];
  var pos = 0;
  for (final s in segs) {
    final end = pos + s.text.length;
    if (cut != null && cut >= pos && cut < end) {
      final before = s.text.substring(0, cut - pos);
      if (before.isNotEmpty) out.add(span(before, s.rule));
      out.add(marker);
      final after = s.text.substring(cut - pos);
      if (after.isNotEmpty) out.add(span(after, s.rule));
      cut = null;
    } else {
      out.add(span(s.text, s.rule));
    }
    pos = end;
  }
  return out;
}
