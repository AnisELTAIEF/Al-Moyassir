import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../theme.dart';

/// Mosaïque des 114 sourates, lue de droite à gauche comme le mushaf.
/// Chaque tuile se colore selon la part apprise ; une sourate complète devient safran.
class KhatmaMosaic extends StatelessWidget {
  const KhatmaMosaic({super.key, required this.memorized, required this.ayahCounts, this.onTap, this.columns = 12, this.pages = false});

  /// memorized[n] = ayat appris dans la sourate n (index 1..114).
  final List<int> memorized;
  final List<int> ayahCounts;
  final void Function(int surah)? onTap;
  final int columns;

  /// Mode « 604 pages » : [memorized] et [ayahCounts] sont alors indexés par page (1..604).
  final bool pages;

  @override
  Widget build(BuildContext context) {
    final cs = context.colors;
    final tones = context.tones;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: LayoutBuilder(builder: (context, c) {
        const gap = 4.0;
        final side = (c.maxWidth - gap * (columns - 1)) / columns;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (var n = 1; n < ayahCounts.length; n++)
              _Tile(
                n: n,
                page: pages,
                side: side,
                ratio: ayahCounts[n] == 0 ? 0 : memorized[n] / ayahCounts[n],
                base: tones.line,
                fill: cs.primary,
                gold: tones.gold,
                onTap: onTap == null ? null : () => onTap!(n),
              ),
          ],
        );
      }),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.n, this.page = false, required this.side, required this.ratio, required this.base, required this.fill, required this.gold, this.onTap});
  final int n;
  final bool page;
  final double side;
  final double ratio;
  final Color base, fill, gold;
  final VoidCallback? onTap;

  /// Couleur du numéro : claire sur fond sombre, encre sur fond clair (safran, tuile vide en mode clair…).
  static Color _ink(Color background) =>
      ThemeData.estimateBrightnessForColor(background) == Brightness.dark ? Colors.white : Palette.ink;

  @override
  Widget build(BuildContext context) {
    final complete = ratio >= 1;
    final color = complete ? gold : ratio == 0 ? base : Color.lerp(base, fill, 0.25 + 0.75 * ratio)!;
    return Semantics(
      button: onTap != null,
      label: (page ? tr('Page {n}, {p} % apprise') : tr('Sourate {n}, {p} % apprise')).replaceAll('{n}', '$n').replaceAll('{p}', '${(ratio * 100).round()}'),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 400),
          width: side,
          height: side,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(side * 0.22)),
          alignment: Alignment.center,
          padding: EdgeInsets.all(side * 0.1),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              '$n',
              textScaler: TextScaler.noScaling,
              textDirection: TextDirection.ltr,
              style: TextStyle(
                fontSize: side * (page ? 0.46 : 0.4),
                height: 1,
                fontWeight: ratio > 0 ? FontWeight.w600 : FontWeight.w500,
                fontFeatures: const [FontFeature.tabularFigures()],
                color: _ink(color).withValues(alpha: ratio == 0 ? 0.6 : 0.95),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
