import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Ornements inspirés de l'architecture islamique (zellige, khatam, arcs) pour les pages du mushaf.

/// Étoile à 8 branches (khatam / rub el hizb) centrée en [c].
Path khatamStar(Offset c, double r, {double inner = 0.66, double rotation = 0}) {
  final p = Path();
  for (var i = 0; i < 16; i++) {
    final a = rotation - math.pi / 2 + i * math.pi / 8;
    final rr = i.isEven ? r : r * inner;
    final pt = c + Offset(math.cos(a) * rr, math.sin(a) * rr);
    i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
  }
  return p..close();
}

/// Cartouche allongé aux extrémités en pointe d'arc (forme des titres de sourate dans les mushafs).
Path cartouchePath(Rect r) {
  final h = r.height, tip = h * 0.62;
  return Path()
    ..moveTo(r.left + tip, r.top)
    ..lineTo(r.right - tip, r.top)
    ..quadraticBezierTo(r.right - h * 0.12, r.top, r.right, r.center.dy)
    ..quadraticBezierTo(r.right - h * 0.12, r.bottom, r.right - tip, r.bottom)
    ..lineTo(r.left + tip, r.bottom)
    ..quadraticBezierTo(r.left + h * 0.12, r.bottom, r.left, r.center.dy)
    ..quadraticBezierTo(r.left + h * 0.12, r.top, r.left + tip, r.top)
    ..close();
}

/// Cadre de page : double filet doré, bande ornée d'étoiles, rosettes d'angle.
class IslamicFramePainter extends CustomPainter {
  IslamicFramePainter({required this.gold, required this.accent, required this.paper, this.band = 12});
  final Color gold, accent, paper;
  final double band;

  @override
  void paint(Canvas canvas, Size size) {
    final outer = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(14));
    final innerRect = Rect.fromLTWH(band, band, size.width - 2 * band, size.height - 2 * band);
    final inner = RRect.fromRectAndRadius(innerRect, const Radius.circular(6));

    canvas.drawRRect(outer, Paint()..color = paper);
    // Bande entre les deux filets.
    canvas.drawPath(
      Path()
        ..fillType = PathFillType.evenOdd
        ..addRRect(outer)
        ..addRRect(inner),
      Paint()..color = accent.withValues(alpha: 0.10),
    );
    final goldLine = Paint()
      ..color = gold
      ..style = PaintingStyle.stroke;
    canvas.drawRRect(outer.deflate(0.8), goldLine..strokeWidth = 1.6);
    canvas.drawRRect(inner, goldLine..strokeWidth = 1.1);
    canvas.drawRRect(
      inner.deflate(3),
      Paint()
        ..color = accent.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.6,
    );

    // Frise d'étoiles le long de la bande.
    final star = Paint()..color = gold.withValues(alpha: 0.75);
    final dot = Paint()..color = accent.withValues(alpha: 0.45);
    final m = band / 2, sr = band * 0.30;
    void frieze(Offset a, Offset b) {
      final len = (b - a).distance;
      final n = math.max(1, (len / (band * 2.2)).floor());
      for (var i = 0; i <= n; i++) {
        final p = Offset.lerp(a, b, i / n)!;
        canvas.drawPath(khatamStar(p, sr), star);
        if (i < n) canvas.drawCircle(Offset.lerp(a, b, (i + 0.5) / n)!, band * 0.08, dot);
      }
    }

    final w = size.width, h = size.height, gap = band * 2.4;
    frieze(Offset(gap, m), Offset(w - gap, m));
    frieze(Offset(gap, h - m), Offset(w - gap, h - m));
    frieze(Offset(m, gap), Offset(m, h - gap));
    frieze(Offset(w - m, gap), Offset(w - m, h - gap));

    // Rosettes d'angle.
    for (final c in [Offset(m, m), Offset(w - m, m), Offset(m, h - m), Offset(w - m, h - m)]) {
      canvas.drawPath(khatamStar(c, band * 0.95), Paint()..color = gold);
      canvas.drawPath(khatamStar(c, band * 0.95, rotation: math.pi / 8), Paint()..color = gold.withValues(alpha: 0.55));
      canvas.drawCircle(c, band * 0.30, Paint()..color = paper);
      canvas.drawCircle(c, band * 0.16, Paint()..color = accent);
    }
  }

  @override
  bool shouldRepaint(IslamicFramePainter old) => old.gold != gold || old.accent != accent || old.paper != paper || old.band != band;
}

/// Cartouche en arc : fond [fill], double filet doré, petites étoiles aux pointes.
class CartouchePainter extends CustomPainter {
  CartouchePainter({required this.fill, required this.gold});
  final Color fill, gold;

  @override
  void paint(Canvas canvas, Size size) {
    final r = Offset.zero & size;
    final path = cartouchePath(r.deflate(1));
    canvas.drawPath(path, Paint()..color = fill);
    canvas.drawPath(
      path,
      Paint()
        ..color = gold
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
    canvas.drawPath(
      cartouchePath(r.deflate(4.5)),
      Paint()
        ..color = gold.withValues(alpha: 0.6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7,
    );
    final sr = size.height * 0.16;
    for (final c in [Offset(size.height * 0.62, size.height / 2), Offset(size.width - size.height * 0.62, size.height / 2)]) {
      canvas.drawPath(khatamStar(c, sr), Paint()..color = gold);
    }
  }

  @override
  bool shouldRepaint(CartouchePainter old) => old.fill != fill || old.gold != gold;
}

/// Fond des cartouches : vert zellige profond (aussi en mode sombre, où la couleur primaire est trop claire).
Color cartoucheFill(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? Palette.zellige : context.colors.primary;

/// Texte posé sur un cartouche.
Color cartoucheInk(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? Colors.white : context.colors.onPrimary;

/// Titre dans un cartouche en arc.
class Cartouche extends StatelessWidget {
  const Cartouche({super.key, required this.child, this.height = 44, this.width, this.fill});
  final Widget child;
  final double height;
  final double? width;
  final Color? fill;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: width,
        child: CustomPaint(
          painter: CartouchePainter(fill: fill ?? cartoucheFill(context), gold: context.tones.gold),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: height * 0.95),
            child: Center(child: child),
          ),
        ),
      );
}

/// Couleur « papier » des pages : légèrement chaude en clair, surface du thème en sombre.
Color pagePaper(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? context.colors.surface : const Color(0xFFFBF8EF);

/// Page encadrée : cadre ornemental, cartouche de titre en haut, médaillon en bas.
class IslamicPageFrame extends StatelessWidget {
  const IslamicPageFrame({super.key, required this.child, required this.title, required this.footer, this.band = 12});
  final Widget child;
  final Widget title;
  final Widget footer;
  final double band;

  /// Marges intérieures occupées par le cadre (les étiquettes sont posées sur les filets, sans prendre de place).
  static EdgeInsets contentInsets(double band) => EdgeInsets.fromLTRB(band + 6, band + 7, band + 6, band + 7);

  static const pillHeight = 18.0;

  @override
  Widget build(BuildContext context) {
    final pillTop = band / 2 - pillHeight / 2;
    return CustomPaint(
      painter: IslamicFramePainter(gold: context.tones.gold, accent: context.colors.primary, paper: pagePaper(context), band: band),
      child: Stack(clipBehavior: Clip.none, children: [
        Padding(padding: contentInsets(band), child: child),
        Positioned(top: pillTop, left: 0, right: 0, child: Center(child: title)),
        Positioned(bottom: pillTop, left: 0, right: 0, child: Center(child: footer)),
      ]),
    );
  }
}

/// Petite étiquette posée sur un filet du cadre (juz/hizb en haut, n° de page en bas).
class FramePill extends StatelessWidget {
  const FramePill(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        height: IslamicPageFrame.pillHeight,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: pagePaper(context),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: context.tones.gold, width: 1),
        ),
        child: Center(
          widthFactor: 1,
          child: Text(text, style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 12.5, height: 1.15, color: context.tones.muted)),
        ),
      );
}
