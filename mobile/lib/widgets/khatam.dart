import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Étoile à huit branches (khatam) : deux carrés superposés, motif des zelliges.
Path khatamPath(Rect r) {
  final c = r.center;
  final h = r.shortestSide / 2;
  Path square(double angle) {
    final p = Path();
    for (var i = 0; i < 4; i++) {
      final a = angle + i * math.pi / 2;
      final pt = c + Offset(math.cos(a), math.sin(a)) * h;
      i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
    }
    return p..close();
  }
  return Path.combine(PathOperation.union, square(math.pi / 4), square(0));
}

class _KhatamPainter extends CustomPainter {
  _KhatamPainter({required this.fill, required this.stroke, required this.strokeWidth, this.doubleLine = false, this.dot});
  final Color? fill;
  final Color stroke;
  final double strokeWidth;
  final bool doubleLine;
  final Color? dot;

  @override
  void paint(Canvas canvas, Size size) {
    final path = khatamPath(Offset.zero & size);
    if (fill != null) canvas.drawPath(path, Paint()..color = fill!);
    canvas.drawPath(path, Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeJoin = StrokeJoin.round);
    if (doubleLine) {
      final inset = size.shortestSide * 0.13;
      canvas.drawPath(khatamPath((Offset.zero & size).deflate(inset)), Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth * 0.8
        ..strokeJoin = StrokeJoin.round);
    }
    if (dot != null) {
      // Pastille sur la branche haute de l'étoile.
      final r = size.shortestSide * 0.13;
      final c = Offset(size.width / 2, r * 0.9);
      canvas.drawCircle(c, r + strokeWidth, Paint()..color = stroke);
      canvas.drawCircle(c, r, Paint()..color = dot!);
    }
  }

  @override
  bool shouldRepaint(_KhatamPainter o) =>
      o.fill != fill || o.stroke != stroke || o.strokeWidth != strokeWidth || o.doubleLine != doubleLine || o.dot != dot;
}

/// Pastille numérotée en forme d'étoile (numéro de sourate ou fin d'ayah).
class KhatamBadge extends StatelessWidget {
  const KhatamBadge({super.key, required this.label, this.size = 40, this.fill, this.stroke, this.textColor, this.semanticLabel, this.doubleLine = false, this.dot});
  final String label;

  /// Double filet (niveau « en cours »).
  final bool doubleLine;

  /// Pastille en haut de l'étoile (niveau « à revoir »).
  final Color? dot;
  final double size;
  final Color? fill;
  final Color? stroke;
  final Color? textColor;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Semantics(
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _KhatamPainter(fill: fill, stroke: stroke ?? cs.primary, strokeWidth: size / 22, doubleLine: doubleLine, dot: dot),
          child: Center(
            child: Text(label,
                textScaler: TextScaler.noScaling,
                style: TextStyle(fontFamily: 'ReadexPro', fontSize: size * (label.length > 2 ? 0.28 : 0.33), fontWeight: FontWeight.w600, color: textColor ?? cs.onSurface)),
          ),
        ),
      ),
    );
  }
}

/// Chiffres arabes-indiens pour les numéros d'ayah dans le texte.
String arabicDigits(int n) => n.toString().split('').map((d) => '٠١٢٣٤٥٦٧٨٩'[int.parse(d)]).join();
