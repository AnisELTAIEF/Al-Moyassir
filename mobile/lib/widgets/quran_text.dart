import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import 'ayah_coloring.dart';
import 'islamic_frame.dart';
import 'khatam.dart';
import 'tajweed_view.dart';

/// Texte coranique continu (modes page) : ayat à la suite, chacun suivi d'un médaillon numéroté.
/// La mesure et l'affichage utilisent exactement la même structure, pour que la pagination tombe juste.

/// Basmala (orthographe du texte de Qalun), affichée en tête de sourate sauf at-Tawba.
const basmala = 'بِسْمِ اِ۬للَّهِ اِ۬لرَّحْمَٰنِ اِ۬لرَّحِيمِ';

const quranLineHeight = 2.0;

/// Style du texte coranique. Espacements fixés explicitement : sinon le widget hérite de ceux du
/// thème (letterSpacing 0,25 en Material 3) et la page affichée ne correspond plus à la page mesurée.
TextStyle quranStyle(double fontSize, Color color) => TextStyle(
      fontFamily: 'ScheherazadeNew',
      fontSize: fontSize,
      height: quranLineHeight,
      color: color,
      letterSpacing: 0,
      wordSpacing: 0,
      fontWeight: FontWeight.w400,
      fontStyle: FontStyle.normal,
    );

/// Taille du médaillon de fin d'ayah (étoile à 8 branches portant le numéro).
double badgeSize(double fontSize) => fontSize * 1.05;

/// Hauteur d'une suite d'ayat d'une sourate, justifiée sur [width].
double measureAyahRun(Surah surah, List<int> ayahs, Divisions div, double fontSize, double width, TextScaler scaler) {
  if (ayahs.isEmpty) return 0;
  final badge = badgeSize(fontSize);
  final tp = TextPainter(
    text: TextSpan(style: quranStyle(fontSize, Colors.black), children: [
      for (final a in ayahs) ...[
        TextSpan(text: '${div.markerIn(surah.number, a) != null ? '۞ ' : ''}${surah.ayahs[a - 1]} '),
        const WidgetSpan(alignment: PlaceholderAlignment.middle, child: SizedBox()),
        const TextSpan(text: ' '),
      ],
    ]),
    textDirection: TextDirection.rtl,
    textAlign: TextAlign.justify,
    textScaler: scaler,
  )
    ..setPlaceholderDimensions([
      for (final _ in ayahs) PlaceholderDimensions(size: Size(badge, badge), alignment: PlaceholderAlignment.middle),
    ])
    ..layout(maxWidth: width);
  final h = tp.height;
  tp.dispose();
  return h;
}

/// Hauteur de la basmala centrée.
double measureBasmala(double fontSize, double width, TextScaler scaler) {
  final tp = TextPainter(
    text: TextSpan(text: basmala, style: quranStyle(fontSize, Colors.black)),
    textDirection: TextDirection.rtl,
    textScaler: scaler,
  )..layout(maxWidth: width);
  final h = tp.height;
  tp.dispose();
  return h;
}

/// Spans d'une suite d'ayat : tajwid, ۞, colorisation de fond, surlignage de l'ayah récité,
/// médaillon selon le suivi. Le texte coranique lui-même n'est jamais modifié.
List<InlineSpan> ayahRunSpans(
  BuildContext context, {
  required Surah surah,
  required List<int> ayahs,
  required Divisions div,
  required double fontSize,
  required bool tajweed,
  required ProgressStore store,
  required TapGestureRecognizer Function(int ayah) tap,
  AyahPainter? painter,
  int? playing,
  Key? playingKey,
}) {
  final cs = context.colors;
  final tones = context.tones;
  final badge = badgeSize(fontSize);
  final spans = <InlineSpan>[];
  for (final a in ayahs) {
    final bg = painter?.background(surah.number, a, isPlaying: a == playing) ?? (a == playing ? playingBackground(context) : null);
    final recognizer = tap(a);
    final status = store.statusOf(surah.number, a);
    final label = arabicDigits(a);
    final medallion = painter != null && painter.validationMode && painter.teacherView
        // Séance de l'enseignant : le fond dit ce qu'il a validé ; aucune marque personnelle de l'élève.
        ? KhatamBadge(label: label, size: badge, stroke: tones.gold, textColor: cs.onSurface)
        // Élève en mode validation : fond = enseignant, médaillon = ses propres marques (vue combinée).
        : painter != null && painter.masteryBadges
        ? masteryBadge(context, painter.masteryOf(surah.number, a), label: label, size: badge, colorBlind: painter.settings.colorBlind)
        : KhatamBadge(
            label: label,
            size: badge,
            fill: status == AyahStatus.memorized ? cs.primary : null,
            stroke: status == null ? tones.gold : status == AyahStatus.memorized ? cs.primary : tones.red,
            textColor: status == AyahStatus.memorized ? cs.onPrimary : cs.onSurface,
          );
    spans
      ..addAll(ayahSpans(
        context,
        surah.ayahs[a - 1],
        tajweed: tajweed,
        isFirstAyahs: a <= 2,
        markerWord: div.markerIn(surah.number, a)?.$1,
        recognizer: recognizer,
        background: bg,
      ))
      ..add(TextSpan(text: ' ', style: TextStyle(backgroundColor: bg)))
      ..add(WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: Listener(
          // Le médaillon partage le geste de son ayah (toucher / appui long).
          onPointerDown: (e) => recognizer.addPointer(e),
          behavior: HitTestBehavior.opaque,
          child: SizedBox.square(
            // Repère de l'ayah récité : sert à l'amener à l'écran quand la page défile.
            key: a == playing ? playingKey : null,
            dimension: badge,
            child: Stack(clipBehavior: Clip.none, children: [
              // Le fond de l'ayah se prolonge sous son médaillon, sur toute la hauteur de la ligne.
              if (bg != null)
                Positioned(
                  left: 0,
                  right: 0,
                  top: -(fontSize * quranLineHeight - badge) / 2,
                  bottom: -(fontSize * quranLineHeight - badge) / 2,
                  child: ColoredBox(color: bg),
                ),
              medallion,
            ]),
          ),
        ),
      ))
      ..add(const TextSpan(text: ' '));
  }
  return spans;
}

/// Titre de sourate dans un cartouche en arc (pages du mushaf).
class SurahTitleBox extends StatelessWidget {
  const SurahTitleBox({super.key, required this.name, this.height = 50});
  final String name;
  final double height;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Cartouche(
          height: height,
          child: Text('سُورَةُ $name',
              maxLines: 1, style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: height * 0.46, height: 1.3, color: cartoucheInk(context))),
        ),
      );
}


/// Texte d'une suite d'ayat (modes page). Identique à `Text.rich`, sauf sur le web : le moteur web
/// de Flutter renvoie parfois les emplacements des médaillons (WidgetSpan) d'une ligne arabe dans le
/// désordre — quand un médaillon tombe en début de ligne, il échange sa place avec le suivant
/// (« ⑧ … ⑦ » au lieu de « ⑦ … ⑧ »), et le toucher d'un ayah semblait marquer le numéro voisin.
/// Les emplacements eux-mêmes sont justes : on les remet dans l'ordre de lecture avant de placer
/// les médaillons.
class AyahRunText extends RichText {
  AyahRunText({super.key, required super.text, required super.textScaler}) : super(textAlign: TextAlign.justify);

  @override
  RenderParagraph createRenderObject(BuildContext context) => _AyahRunParagraph(
        text,
        textAlign: textAlign,
        textDirection: textDirection ?? Directionality.of(context),
        textScaler: textScaler,
        locale: locale ?? Localizations.maybeLocaleOf(context),
        devicePixelRatio: MediaQuery.maybeDevicePixelRatioOf(context) ?? 1.0,
      );
}

class _AyahRunParagraph extends RenderParagraph {
  _AyahRunParagraph(
    super.text, {
    required super.textAlign,
    required super.textDirection,
    required super.textScaler,
    super.locale,
    required super.devicePixelRatio,
  });

  @override
  void positionInlineChildren(List<ui.TextBox> boxes) =>
      super.positionInlineChildren(kIsWeb && textDirection == TextDirection.rtl ? rtlReadingOrder(boxes) : boxes);
}

/// Emplacements de médaillons remis dans l'ordre de lecture d'un texte de droite à gauche :
/// lignes de haut en bas, puis de droite à gauche dans chaque ligne.
List<ui.TextBox> rtlReadingOrder(List<ui.TextBox> boxes) {
  if (boxes.length < 2) return boxes;
  double mid(ui.TextBox b) => (b.top + b.bottom) / 2;
  final byY = [...boxes]..sort((a, b) => mid(a).compareTo(mid(b)));
  final lines = <List<ui.TextBox>>[];
  for (final b in byY) {
    final line = lines.isEmpty ? null : lines.last;
    // Même ligne : centres verticaux à moins d'une demi-hauteur de médaillon.
    if (line != null && (mid(b) - mid(line.first)).abs() < (b.bottom - b.top) / 2) {
      line.add(b);
    } else {
      lines.add([b]);
    }
  }
  return [
    for (final line in lines) ...(line..sort((a, b) => b.right.compareTo(a.right))),
  ];
}
