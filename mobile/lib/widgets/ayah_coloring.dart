import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/settings.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import 'common.dart';
import 'islamic_frame.dart';
import 'khatam.dart';

/// Colorisation des ayat : uniquement des couleurs de FOND (le texte coranique n'est jamais touché).
///
/// Les fonds sont des teintes opaques mélangées au papier de la page, assez douces pour garder
/// un contraste élevé avec l'encre et avec les couleurs du tajwid (vérifié par les tests).

/// Teintes « par ayah » : pas de jaune ni d'ambre, réservés au surlignage doré de l'ayah récité.
const perAyahHues = <Color>[
  Color(0xFF4A90D9), // bleu ciel
  Color(0xFF5BAA6A), // sauge
  Color(0xFF9B7FD1), // lavande
  Color(0xFFE07B91), // rose
  Color(0xFF3AA6A0), // sarcelle
  Color(0xFF8C9AA6), // ardoise
];

/// Variante daltonisme (palette d'Okabe et Ito, sans le jaune ni l'orange).
const perAyahHuesColorBlind = <Color>[
  Color(0xFF56B4E9), // bleu ciel
  Color(0xFFCC79A7), // pourpre rosé
  Color(0xFF009E73), // vert bleuté
  Color(0xFF0072B2), // bleu
  Color(0xFFD55E00), // vermillon
  Color(0xFF999999), // gris
];

/// Couleur pleine d'un niveau de maîtrise (pastilles, légende). `null` : neutre.
Color? masteryHue(Mastery m, {required bool colorBlind}) => switch (m) {
      Mastery.none => null,
      Mastery.learning => colorBlind ? const Color(0xFFD55E00) : const Color(0xFFF08A24), // orange (vermillon si daltonisme : l'orange d'Okabe-Ito est trop proche du doré de la récitation)
      Mastery.review => colorBlind ? const Color(0xFFCC79A7) : const Color(0xFFD64541), // rouge (pourpre rosé si daltonisme)
      Mastery.acquired => colorBlind ? const Color(0xFF0072B2) : const Color(0xFF2E9E57), // vert (bleu si daltonisme)
    };

/// Part de la teinte mélangée au papier : un peu plus en sombre, où les teintes ressortent moins.
double _tintStrength(Brightness b, {bool alt = false}) => b == Brightness.dark ? (alt ? 0.15 : 0.20) : (alt ? 0.13 : 0.18);

/// Fond opaque : [hue] mélangé au [paper].
Color tint(Color paper, Color hue, Brightness b, {bool alt = false}) => Color.lerp(paper, hue, _tintStrength(b, alt: alt))!;

/// Nombre de teintes « par ayah » : 2 en Tahfidh (un ayah par bloc, une simple alternance suffit), 6 en Qira'a.
int perAyahColorCount(ReadingMode mode) => mode == ReadingMode.ayah ? 2 : 6;

/// Fond « par ayah » : [colors] teintes en rotation, d'intensité alternée (repère de clarté en plus de la teinte).
Color perAyahBackground(int ayah, {required Color paper, required Brightness brightness, required bool colorBlind, int colors = 6}) {
  final all = colorBlind ? perAyahHuesColorBlind : perAyahHues;
  // À deux couleurs : bleu et sauge (bleu ciel et gris en palette daltonisme).
  final hues = colors == 2 ? [all[0], colorBlind ? all[5] : all[1]] : all;
  return tint(paper, hues[(ayah - 1) % hues.length], brightness, alt: ayah.isEven);
}

/// Fond « par niveau de maîtrise » (`null` pour un ayah non suivi).
Color? masteryBackground(Mastery m, {required Color paper, required Brightness brightness, required bool colorBlind}) {
  final hue = masteryHue(m, colorBlind: colorBlind);
  return hue == null ? null : tint(paper, hue, brightness);
}

/// Fond « validation de l'enseignant » (`null` : rien de validé). Mêmes teintes que la maîtrise : vert acquis,
/// orange acquis avec erreur (vermillon en palette daltonisme), rouge à revoir. Ce mode REMPLACE la colorisation
/// personnelle (il n'y a jamais deux séries de couleurs superposées) : la marque de l'élève passe sur le médaillon.
Color? validationBackground(ValResult? r, {required Color paper, required Brightness brightness, required bool colorBlind}) {
  if (r == null) return null;
  final m = switch (r) { ValResult.acquired => Mastery.acquired, ValResult.acquiredError => Mastery.learning, ValResult.review => Mastery.review };
  return masteryBackground(m, paper: paper, brightness: brightness, colorBlind: colorBlind);
}

String validationLabel(ValResult r) => switch (r) {
      ValResult.acquired => tr('Acquis'),
      ValResult.acquiredError => tr('Acquis avec erreur'),
      ValResult.review => tr('À revoir'),
    };

/// Surlignage de l'ayah en cours de récitation : prioritaire sur toute colorisation.
Color playingBackground(BuildContext context) => context.tones.gold.withValues(alpha: 0.30);

String masteryLabel(Mastery m) => switch (m) {
      Mastery.none => tr('Non appris'),
      Mastery.learning => tr('En cours'),
      Mastery.review => tr('À revoir'),
      Mastery.acquired => tr('Acquis'),
    };

/// Calcule la colorisation de chaque ayah pour un écran (réglages + suivi).
class AyahPainter {
  AyahPainter(BuildContext context, {required this.settings, required this.store, this.validations, this.teacherView = false, Color? paper})
      : coloring = teacherView ? AyahColoring.validation : settings.coloring,
        perAyahColors = perAyahColorCount(settings.readingMode),
        brightness = Theme.of(context).brightness,
        paper = paper ?? pagePaper(context),
        playing = playingBackground(context),
        _now = DateTime.now();

  final Settings settings;
  final ProgressStore store;

  /// Validations de l'enseignant (élève : les siennes ; enseignant : celles de la séance en cours).
  final ValidationView? validations;

  /// Vue de l'enseignant : seule la validation est montrée, JAMAIS la progression personnelle (ni la sienne ni celle de l'élève).
  final bool teacherView;
  final AyahColoring coloring;
  final int perAyahColors;
  final Brightness brightness;
  final Color paper;
  final Color playing;
  final DateTime _now;

  bool get mastery => coloring == AyahColoring.mastery;
  bool get validationMode => coloring == AyahColoring.validation;

  /// Marque personnelle « à réviser » de l'élève (anneau sur le médaillon) : jamais en vue enseignant.
  bool personalReview(int surah, int ayah) => validationMode && !teacherView && store.storedMasteryOf(surah, ayah) == Mastery.review;

  /// Médaillons « par niveau » (forme + couleur) : dès que le toucher change le niveau.
  bool get masteryBadges => tapCyclesMastery(settings);

  Mastery masteryOf(int surah, int ayah) => store.masteryOf(surah, ayah, includeOverdue: settings.overdueAsReview, now: _now);

  /// Fond d'un ayah ; l'ayah récité garde toujours le surlignage doré.
  Color? background(int surah, int ayah, {bool isPlaying = false}) {
    if (isPlaying) return playing;
    return switch (coloring) {
      AyahColoring.none => null,
      AyahColoring.perAyah =>
        perAyahBackground(ayah, paper: paper, brightness: brightness, colorBlind: settings.colorBlind, colors: perAyahColors),
      AyahColoring.mastery =>
        masteryBackground(masteryOf(surah, ayah), paper: paper, brightness: brightness, colorBlind: settings.colorBlind),
      AyahColoring.validation =>
        validationBackground(validations?.of(surah, ayah), paper: paper, brightness: brightness, colorBlind: settings.colorBlind),
    };
  }
}

/// Médaillon de fin d'ayah en colorisation par maîtrise : la FORME porte aussi le niveau
/// (simple filet / double filet / plein / pastille), pour ne pas dépendre de la seule couleur.
KhatamBadge masteryBadge(BuildContext context, Mastery m, {required String label, required double size, required bool colorBlind}) {
  final hue = masteryHue(m, colorBlind: colorBlind);
  final onSurface = context.colors.onSurface;
  return switch (m) {
    Mastery.none => KhatamBadge(label: label, size: size, stroke: context.tones.gold, textColor: onSurface),
    Mastery.learning => KhatamBadge(label: label, size: size, stroke: hue, textColor: onSurface, doubleLine: true),
    Mastery.review => KhatamBadge(label: label, size: size, stroke: hue, textColor: onSurface, dot: hue),
    Mastery.acquired => KhatamBadge(
        label: label,
        size: size,
        fill: hue,
        stroke: hue,
        textColor: ThemeData.estimateBrightnessForColor(hue!) == Brightness.dark ? Colors.white : Palette.ink,
      ),
  };
}

/// Toucher bref → [onTap] ; appui long → [onLongPress] (déclenché pendant l'appui, avec un retour haptique).
/// Un seul reconnaisseur, utilisable sur les morceaux de texte (TextSpan) comme sur les médaillons.
TapGestureRecognizer ayahRecognizer({required VoidCallback onTap, required VoidCallback onLongPress}) {
  Timer? timer;
  var long = false;
  return TapGestureRecognizer()
    ..onTapDown = (_) {
      long = false;
      timer?.cancel();
      // onTapDown arrive après kPressTimeout : on complète jusqu'au délai standard d'appui long.
      timer = Timer(kLongPressTimeout - kPressTimeout, () {
        long = true;
        HapticFeedback.selectionClick();
        onLongPress();
      });
    }
    ..onTapUp = (_) {
      timer?.cancel();
      if (!long) onTap();
    }
    ..onTapCancel = () => timer?.cancel();
}

/// Un toucher sur un ayah change-t-il son niveau de maîtrise ? Oui en colorisation par maîtrise
/// (Qira'a et Tahfidh), et aussi en colorisation par ayah en Qira'a (le médaillon montre alors le niveau).
bool tapCyclesMastery(Settings s, [ReadingMode? mode]) {
  final m = mode ?? s.readingMode;
  final c = s.coloringIn(m);
  return c == AyahColoring.mastery || (c == AyahColoring.perAyah && m == ReadingMode.mushaf);
}

/// Passe un ayah au niveau de maîtrise suivant, avec « Annuler ».
Future<void> cycleAyahMastery(BuildContext context, int surah, int ayah) async {
  final store = context.read<ProgressStore>();
  final before = store.snapshotAyahs([(surah, ayah)]);
  HapticFeedback.selectionClick();
  final next = await store.cycleMastery(surah, ayah);
  if (!context.mounted) return;
  snack(context, tr('Ayah {n} : {level}', {'n': ayah, 'level': masteryLabel(next)}),
      action: SnackBarAction(label: tr('Annuler'), onPressed: () => store.restoreAyahs(before)));
}

/// Bouton de légende (barre du lecteur) : n'apparaît que si une colorisation est active.
class ColoringLegendButton extends StatelessWidget {
  const ColoringLegendButton({super.key, required this.settings});
  final Settings settings;

  @override
  Widget build(BuildContext context) {
    if (settings.coloring == AyahColoring.none && !settings.tajweed) return const SizedBox.shrink();
    return IconButton(
      tooltip: tr('Légende des couleurs'),
      icon: const Icon(Icons.palette_outlined),
      onPressed: () => showColoringLegend(context),
    );
  }
}

/// Légende de la séance de l'enseignant.
Future<void> showValidationLegend(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => const SafeArea(
          child: Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 20), child: ColoringLegend(coloring: AyahColoring.validation, teacher: true))),
    );

Future<void> showColoringLegend(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => const SafeArea(child: Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 20), child: ColoringLegend())),
    );

/// Légende de la colorisation active.
class ColoringLegend extends StatelessWidget {
  const ColoringLegend({super.key, this.mode, this.coloring, this.teacher = false});

  /// Colorisation à expliquer (par défaut : celle du réglage du mode).
  final AyahColoring? coloring;

  /// Légende de la séance de l'enseignant : sans la marque personnelle de l'élève (qu'il ne voit jamais).
  final bool teacher;

  /// Mode de lecture dont on montre la légende (par défaut : le mode courant).
  final ReadingMode? mode;

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final m = mode ?? settings.readingMode;
    final coloring = this.coloring ?? settings.coloringIn(m);
    final tajweed = settings.tajweedIn(m);
    final b = Theme.of(context).brightness;
    final paper = pagePaper(context);
    final cb = settings.colorBlind;

    Widget swatch(Color? bg, String label, {Mastery? m}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 28,
              height: 20,
              decoration: BoxDecoration(
                color: bg ?? paper,
                borderRadius: BorderRadius.circular(5),
                border: Border.all(color: context.tones.line),
              ),
            ),
            if (m != null) ...[
              const SizedBox(width: 8),
              masteryBadge(context, m, label: '٣', size: 24, colorBlind: cb),
            ],
            const SizedBox(width: 10),
            Flexible(child: Text(label, style: context.text.bodyMedium)),
          ]),
        );

    final children = <Widget>[];
    switch (coloring) {
      case AyahColoring.none:
        break;
      case AyahColoring.perAyah:
        children
          ..add(Text(tr('Par ayah'), style: context.text.titleSmall))
          ..add(Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Wrap(spacing: 6, runSpacing: 6, children: [
              for (var a = 1; a <= perAyahColorCount(m); a++)
                Container(
                  width: 28,
                  height: 20,
                  decoration: BoxDecoration(
                    color: perAyahBackground(a, paper: paper, brightness: b, colorBlind: cb, colors: perAyahColorCount(m)),
                    borderRadius: BorderRadius.circular(5),
                    border: Border.all(color: context.tones.line),
                  ),
                ),
            ]),
          ))
          ..add(Text(tr('Les couleurs alternent d’un ayah à l’autre, sans signification particulière.'), style: context.text.bodySmall));
        if (m == ReadingMode.mushaf) {
          children
            ..add(const SizedBox(height: 10))
            ..add(Text(tr('Niveau de maîtrise (médaillon de fin d’ayah)'), style: context.text.titleSmall));
          for (final lv in Mastery.values) {
            children.add(Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                masteryBadge(context, lv, label: '٣', size: 24, colorBlind: cb),
                const SizedBox(width: 10),
                Flexible(child: Text(masteryLabel(lv), style: context.text.bodyMedium)),
              ]),
            ));
          }
          children.add(Text(tr('Touchez un ayah pour changer son niveau : en cours → acquis → à revoir → non appris. Appui long pour plus d’options.'),
              style: context.text.bodySmall));
        }
      case AyahColoring.validation:
        break; // légende dédiée ci-dessous
      case AyahColoring.mastery:
        children.add(Text(tr('Par niveau de maîtrise'), style: context.text.titleSmall));
        for (final m in Mastery.values) {
          children.add(swatch(masteryBackground(m, paper: paper, brightness: b, colorBlind: cb), masteryLabel(m), m: m));
        }
        children.add(Text(
          settings.overdueAsReview
              ? tr('« À revoir » : marqué par vous, ou révision en retard. Touchez un ayah pour changer son niveau ; appui long pour plus d’options.')
              : tr('« À revoir » : marqué par vous. Touchez un ayah pour changer son niveau ; appui long pour plus d’options.'),
          style: context.text.bodySmall,
        ));
    }
    if (coloring == AyahColoring.validation) {
      children.add(Text(tr('Validation de l’enseignant'), style: context.text.titleSmall));
      for (final r in ValResult.values) {
        children.add(swatch(validationBackground(r, paper: paper, brightness: b, colorBlind: cb), validationLabel(r)));
      }
      if (teacher) {
        children.add(Text(tr('Touchez un ayah pour changer son résultat : acquis → acquis avec erreur → à revoir → effacé.'), style: context.text.bodyMedium));
      } else {
        children.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          KhatamBadge(label: '٣', size: 26, stroke: context.tones.gold, textColor: context.colors.onSurface, ring: context.tones.red, dot: context.tones.red),
          const SizedBox(width: 10),
          Flexible(child: Text(tr('Votre marque personnelle « à réviser » : visible de vous seul, jamais de l’enseignant.'), style: context.text.bodyMedium)),
        ]),
        ));
      }
      children.add(Text(tr('Une page est « à reprendre » quand trop d’ayat y sont acquis avec erreur ; elle porte alors un bandeau en haut.'), style: context.text.bodySmall));
    }
    children
      ..add(const SizedBox(height: 8))
      ..add(swatch(Color.alphaBlend(playingBackground(context), paper), tr('Ayah en cours de récitation (fond doré, cadre doré en Tahfidh)')));
    if (tajweed) {
      children.add(Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(tr('Tajwid actif : touchez « Légende du tajwid » dans le menu pour le détail des règles.'), style: context.text.bodySmall),
      ));
    }
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}

/// Réglages de colorisation, par mode de lecture (feuille du lecteur et écran Compte).
Future<void> showColoringSettings(BuildContext context, ReadingMode mode) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
          child: ColoringSettingsPanel(initialMode: mode),
        ),
      ),
    );

class ColoringSettingsPanel extends StatefulWidget {
  const ColoringSettingsPanel({super.key, required this.initialMode});
  final ReadingMode initialMode;

  @override
  State<ColoringSettingsPanel> createState() => _ColoringSettingsPanelState();
}

class _ColoringSettingsPanelState extends State<ColoringSettingsPanel> {
  late ReadingMode _mode = widget.initialMode;

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final coloring = settings.coloringIn(_mode);
    String subtitle(AyahColoring c) => switch (c) {
          AyahColoring.none => tr('Texte sur fond uni'),
          AyahColoring.perAyah => _mode == ReadingMode.ayah
              ? tr('Deux fonds doux en alternance (par défaut)')
              : tr('Six fonds doux en rotation. Touchez un ayah pour changer son niveau.'),
          AyahColoring.mastery => _mode == ReadingMode.mushaf
              ? tr('Non appris, en cours, à revoir, acquis — touchez un ayah pour changer (par défaut)')
              : tr('Non appris, en cours, à revoir, acquis — touchez un ayah pour changer'),
          AyahColoring.validation => tr('Acquis, acquis avec erreur, à revoir — validés par votre enseignant'),
        };
    // « Validation » n'est proposée qu'aux élèves que leur enseignant a déjà validés.
    final hasValidations = context.watch<ValidationStore>().hasAny;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Text(tr('Colorisation des ayat'), style: context.text.titleMedium),
      ),
      const SizedBox(height: 8),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: SegmentedButton<ReadingMode>(
          showSelectedIcon: false,
          segments: [
            for (final m in ReadingMode.values) ButtonSegment(value: m, icon: Icon(m.icon, size: 18), label: Text(m.label)),
          ],
          selected: {_mode},
          onSelectionChanged: (s) => setState(() => _mode = s.first),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
        child: Text(tr('Réglage propre à chaque mode et à chaque compte.'), style: context.text.bodySmall?.copyWith(color: context.tones.muted)),
      ),
      for (final c in AyahColoring.values.where((c) => c != AyahColoring.validation || hasValidations || c == coloring))
        ListTile(
          leading: Icon(c == coloring ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: c == coloring ? context.colors.primary : context.tones.muted),
          title: Text(c.label),
          subtitle: Text(subtitle(c)),
          selected: c == coloring,
          onTap: () => settings.setColoringIn(_mode, c),
        ),
      SwitchListTile(
        title: Text(tr('Couleurs du tajwid')),
        subtitle: Text(tr('Colore les lettres selon les règles de lecture (cumulable avec un fond)')),
        value: settings.tajweedIn(_mode),
        onChanged: (v) => settings.setTajweedIn(_mode, v),
      ),
      SwitchListTile(
        title: Text(tr('Palette adaptée au daltonisme')),
        subtitle: Text(tr('Bleu, vermillon et pourpre au lieu de vert, orange et rouge')),
        value: settings.colorBlind,
        onChanged: (v) => settings.colorBlind = v,
      ),
      if (coloring == AyahColoring.mastery)
        SwitchListTile(
          title: Text(tr('Révisions en retard en « à revoir »')),
          subtitle: Text(tr('Appris sans révision depuis 3 jours, ou révisé il y a plus de 7 jours')),
          value: settings.overdueAsReview,
          onChanged: (v) => settings.overdueAsReview = v,
        ),
      if (coloring != AyahColoring.none)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: ColoringLegend(mode: _mode),
        ),
    ]);
  }
}
