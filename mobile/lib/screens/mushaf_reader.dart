import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/audio_controller.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../theme.dart';
import '../widgets/ayah_coloring.dart';
import '../widgets/islamic_frame.dart';
import '../widgets/khatam.dart';
import '../widgets/quran_text.dart';
import 'reader_screen.dart';

/// Les 604 pages du mushaf de Qalun (édition de Médine, KFGQPC), du début à la fin du Coran.
///
/// Chaque page contient les mêmes ayat que la page imprimée (débuts de page alignés sur le texte
/// libyen) ; la taille du texte est réduite si nécessaire pour que la page tienne à l'écran.
class MushafReader extends StatefulWidget {
  const MushafReader({super.key, required this.surah, required this.ayah, required this.onShown});
  final int surah, ayah;

  /// Premier ayah de la page affichée.
  final void Function(int surah, int ayah) onShown;

  @override
  State<MushafReader> createState() => _MushafReaderState();
}

class _MushafReaderState extends State<MushafReader> {
  late final QuranRepository _repo = context.read<QuranRepository>();
  late final AudioController _audio = context.read<AudioController>();
  late final PageController _controller = PageController(initialPage: _repo.mushafPageOf(widget.surah, widget.ayah) - 1);
  late int _current = _controller.initialPage;
  final Map<String, TapGestureRecognizer> _taps = {};
  final Map<int, double> _fit = {};
  final Map<String, bool> _overflow = {};
  String? _layoutKey;
  String? _followed;
  String? _ensured; // dernier ayah récité amené à l'écran dans une page qui défile
  final _playingBadge = GlobalKey();

  /// Marge autour du cadre, épaisseur de sa bande, ligne juz/hizb, cartouche de titre de sourate.
  static const _outer = EdgeInsets.fromLTRB(6, 8, 6, 8); // place pour les rosettes et les étiquettes qui débordent du cadre
  static const _band = 9.0, _titleH = 40.0, _minFont = 14.0;
  static EdgeInsets get _inset => IslamicPageFrame.contentInsets(_band);

  @override
  void initState() {
    super.initState();
    _audio.addListener(_follow);
  }

  @override
  void dispose() {
    _audio.removeListener(_follow);
    for (final t in _taps.values) {
      t.dispose();
    }
    _controller.dispose();
    super.dispose();
  }

  /// Toucher : niveau de maîtrise suivant (colorisation par maîtrise ou par ayah), sinon feuille de l'ayah ;
  /// appui long : toujours la feuille de l'ayah.
  TapGestureRecognizer _tap(int surah, int ayah) => _taps.putIfAbsent('$surah:$ayah', () {
        void sheet() => showAyahSheet(context, surah, ayah, _repo.surah(surah).ayahs[ayah - 1]);
        return ayahRecognizer(
          onTap: () => tapCyclesMastery(context.read<Settings>()) ? cycleAyahMastery(context, surah, ayah) : sheet(),
          onLongPress: sheet,
        );
      });

  /// Va à la page voisine (balayage toujours actif ; flèches utiles au clavier/souris et sur grand écran).
  void _goRelative(int delta) {
    if (!_controller.hasClients) return;
    final target = _current + delta;
    if (target < 0 || target >= _repo.mushafPages.length) return;
    _controller.animateToPage(target, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
  }

  /// Flèche de feuilletage, collée à un bord (début = droite en RTL = page précédente).
  Widget _arrow({required bool start, required IconData icon, required String tooltip, VoidCallback? onPressed}) => PositionedDirectional(
        start: start ? 4 : null,
        end: start ? null : 4,
        top: 0,
        bottom: 0,
        child: Center(
          child: IconButton.filledTonal(
            tooltip: tooltip,
            onPressed: onPressed,
            // Sens fixe : sans cela, Flutter retourne les chevrons en RTL et ils pointaient à l'envers.
            icon: Icon(icon, textDirection: TextDirection.ltr),
            style: IconButton.styleFrom(backgroundColor: context.colors.surface.withValues(alpha: 0.72)),
          ),
        ),
      );

  /// Suit la récitation, y compris d'une page à l'autre.
  void _follow() {
    final s = _audio.surah, a = _audio.currentAyah;
    if (s == null || a == null || '$s:$a' == _followed || !_controller.hasClients) return;
    _followed = '$s:$a';
    final p = _repo.mushafPageOf(s, a) - 1;
    if (p != _current) _controller.animateToPage(p, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
  }

  /// Ayat de la page, regroupés par sourate.
  List<(Surah, List<int>)> _segments(int page) {
    final out = <(Surah, List<int>)>[];
    for (final (s, a) in _repo.ayahsOfMushafPage(page)) {
      if (out.isEmpty || out.last.$1.number != s) out.add((_repo.surah(s), <int>[]));
      out.last.$2.add(a);
    }
    return out;
  }

  double _height(List<(Surah, List<int>)> segs, double f, double width, TextScaler scaler) {
    var h = 0.0;
    for (final (surah, ayahs) in segs) {
      if (ayahs.first == 1) h += _titleH + (surah.number == 9 ? 0 : measureBasmala(f, width, scaler));
      h += measureAyahRun(surah, ayahs, _repo.divisions, f, width, scaler);
    }
    return h;
  }

  /// Plus grande taille de texte pour que la page REMPLISSE le cadre : réduite si la page ne tient pas,
  /// agrandie sur grand écran (tablette). Plafond : la plus grande de la taille choisie et d'environ
  /// 1/13 de la largeur (au moins une dizaine de mots par ligne), sans dépasser 96.
  /// (Paysage et zoom : voir [_pageLayout], qui part de cette taille « page entière ».)
  double _fitFont(int page, Size size, double chosenFont, TextScaler scaler) {
    return _fit.putIfAbsent(page, () {
      final width = size.width - _outer.horizontal - _inset.horizontal;
      final avail = size.height - _outer.vertical - _inset.vertical;
      final maxFont = math.max(chosenFont, math.min(width / 13, 96.0));
      final segs = _segments(page);
      if (_height(segs, maxFont, width, scaler) <= avail) return maxFont;
      var lo = _minFont, hi = maxFont;
      for (var i = 0; i < 10; i++) {
        final mid = (lo + hi) / 2;
        if (_height(segs, mid, width, scaler) <= avail) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return lo;
    });
  }

  /// Taille du texte d'une page selon le zoom et l'orientation, et besoin de défilement.
  ///  * Portrait, zoom 0 : page entière (taille ajustée, comme un mushaf imprimé).
  ///  * Paysage : la page entière y serait minuscule ; base confortable d'après la largeur
  ///    (environ 16 caractères arabes de taille [font] par ligne de mushaf), puis défilement.
  ///  * Chaque niveau de zoom : +20 %. Si la page dépasse, elle défile verticalement.
  (double font, bool scroll) _pageLayout(int page, Size size, Settings settings, TextScaler scaler) {
    final fit = _fitFont(page, size, settings.fontSize, scaler);
    final width = size.width - _outer.horizontal - _inset.horizontal;
    final avail = size.height - _outer.vertical - _inset.vertical;
    final landscape = size.width > size.height * 1.15;
    final base = landscape ? math.max(fit, math.min(width / 16, 64.0)) : fit;
    final font = math.min(base * settings.mushafZoomFactor, 120.0);
    if (font <= fit + 0.01) return (fit, false);
    final scroll = _overflow.putIfAbsent('$page@${font.toStringAsFixed(1)}', () => _height(_segments(page), font, width, scaler) > avail);
    return (font, scroll);
  }

  /// Page qui défile : amène l'ayah en cours de récitation à l'écran (une fois par ayah).
  void _ensurePlayingVisible(String id) {
    if (id == _ensured) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _playingBadge.currentContext;
      if (ctx == null || !mounted) return;
      _ensured = id;
      // Le médaillon termine l'ayah : on le place aux deux tiers de l'écran pour voir l'ayah au-dessus.
      // Seulement le défilement vertical de la page (Scrollable.ensureVisible ferait aussi tourner les pages).
      final box = ctx.findRenderObject();
      final position = Scrollable.maybeOf(ctx)?.position;
      if (box == null || position == null) return;
      position.ensureVisible(box, alignment: 0.66, duration: const Duration(milliseconds: 400), curve: Curves.easeOutCubic);
    });
  }

  void _goTo(int page) => _controller.animateToPage(page - 1, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final scaler = MediaQuery.textScalerOf(context);
    return LayoutBuilder(builder: (context, c) {
      final key = '${c.maxWidth.round()}x${c.maxHeight.round()}@${settings.fontSize}/${scaler.scale(10)}';
      if (key != _layoutKey) {
        _layoutKey = key;
        _fit.clear();
        _overflow.clear();
      }
      return Directionality(
        textDirection: TextDirection.rtl, // feuilletage de droite à gauche, comme un mushaf
        child: Stack(children: [
          PageView.builder(
            controller: _controller,
            itemCount: _repo.mushafPages.length,
            onPageChanged: (i) {
              setState(() => _current = i);
              final (s, a) = _repo.mushafPages[i];
              widget.onShown(s, a);
            },
            itemBuilder: (context, i) => _page(context, i + 1, c.biggest, settings, scaler),
          ),
          // Flèches de bord : grand écran seulement (souris, clavier, tablette). Sur téléphone elles
          // masqueraient des mots ; on y feuillette par glissement ou avec les boutons de fin de page.
          if (c.maxWidth >= 600) ...[
            _arrow(start: true, icon: Icons.chevron_right, tooltip: tr('Page précédente'),
                onPressed: _current > 0 ? () => _goRelative(-1) : null),
            _arrow(start: false, icon: Icons.chevron_left, tooltip: tr('Page suivante'),
                onPressed: _current < _repo.mushafPages.length - 1 ? () => _goRelative(1) : null),
          ],
        ]),
      );
    });
  }

  Widget _page(BuildContext context, int page, Size size, Settings settings, TextScaler scaler) {
    final store = context.watch<ProgressStore>();
    final audio = context.watch<AudioController>();
    final cs = context.colors;
    final segs = _segments(page);
    final (f, scroll) = _pageLayout(page, size, settings, scaler);
    final playingHere = audio.currentAyah != null && segs.any((g) => g.$1.number == audio.surah && g.$2.contains(audio.currentAyah));
    if (scroll && playingHere) _ensurePlayingVisible('${audio.surah}:${audio.currentAyah}');
    final (s0, a0) = _repo.mushafPages[page - 1];
    final hizb = _repo.divisions.hizbOf(s0, a0);
    final painter = AyahPainter(context, settings: settings, store: store);

    return Padding(
      padding: _outer,
      child: IslamicPageFrame(
        band: _band,
        title: FramePill('الجزء ${arabicDigits((hizb + 1) ~/ 2)} · الحزب ${arabicDigits(hizb)}'),
        footer: FramePill(arabicDigits(page)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(
            child: SingleChildScrollView(
              // Défile quand le texte est agrandi (zoom, paysage) ou si la page ne tient pas.
              physics: const ClampingScrollPhysics(),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final (surah, ayahs) in segs) ...[
                  if (ayahs.first == 1) ...[
                    SurahTitleBox(name: surah.name, height: _titleH - 8),
                    if (surah.number != 9) Text(basmala, textAlign: TextAlign.center, style: quranStyle(f, cs.onSurface)),
                  ],
                  AyahRunText(
                    textScaler: scaler,
                    text: TextSpan(
                      style: quranStyle(f, cs.onSurface),
                      children: ayahRunSpans(
                        context,
                        surah: surah,
                        ayahs: ayahs,
                        div: _repo.divisions,
                        fontSize: f,
                        tajweed: settings.tajweed,
                        store: store,
                        tap: (a) => _tap(surah.number, a),
                        painter: painter,
                        playing: audio.surah == surah.number ? audio.currentAyah : null,
                        playingKey: _playingBadge,
                      ),
                    ),
                  ),
                ],
                // Texte agrandi : la page défile ; à sa fin, passage à la page suivante ou précédente.
                if (scroll) _PageNav(page: page, last: _repo.mushafPages.length, onGo: _goTo),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Fin d'une page qui défile : page précédente / suivante (dans le sens de lecture du mushaf :
/// la page suivante est à gauche).
class _PageNav extends StatelessWidget {
  const _PageNav({required this.page, required this.last, required this.onGo});
  final int page, last;
  final void Function(int page) onGo;

  @override
  Widget build(BuildContext context) {
    final ui = I18n.isAr ? TextDirection.rtl : TextDirection.ltr;
    Widget label(String t) => Text(t, textDirection: ui, maxLines: 1, overflow: TextOverflow.ellipsis);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 18, 4, 10),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Divider(color: context.tones.gold.withValues(alpha: 0.5)),
        Text(tr('Fin de la page {n}', {'n': page}), textDirection: ui, style: TextStyle(color: context.tones.muted, fontSize: 13)),
        const SizedBox(height: 10),
        Row(children: [
          // RTL : premier enfant à droite = page précédente ; flèches orientées selon le sens de lecture.
          Expanded(
            child: Tooltip(
              message: tr('Page précédente'),
              child: OutlinedButton.icon(
                onPressed: page > 1 ? () => onGo(page - 1) : null,
                icon: const Icon(Icons.arrow_back), // pointe vers la droite en RTL
                label: label(tr('Page {n}', {'n': page - 1})),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Tooltip(
              message: tr('Page suivante'),
              child: FilledButton.icon(
                onPressed: page < last ? () => onGo(page + 1) : null,
                icon: const Icon(Icons.arrow_forward), // pointe vers la gauche en RTL
                label: label(tr('Page {n}', {'n': page + 1})),
              ),
            ),
          ),
        ]),
      ]),
    );
  }
}
