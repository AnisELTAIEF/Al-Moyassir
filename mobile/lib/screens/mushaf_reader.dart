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
  String? _layoutKey;
  String? _followed;

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
            icon: Icon(icon),
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
  ///
  /// En paysage (téléphone tourné), la page est large mais basse : au lieu de réduire le texte à une
  /// taille minuscule pour tout faire tenir, on garde la taille choisie (≈ 2-3 ayat visibles) et la
  /// page défile verticalement.
  double _fitFont(int page, Size size, double chosenFont, TextScaler scaler) {
    return _fit.putIfAbsent(page, () {
      if (size.width > size.height) return chosenFont;
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

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final scaler = MediaQuery.textScalerOf(context);
    return LayoutBuilder(builder: (context, c) {
      final key = '${c.maxWidth.round()}x${c.maxHeight.round()}@${settings.fontSize}/${scaler.scale(10)}';
      if (key != _layoutKey) {
        _layoutKey = key;
        _fit.clear();
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
          _arrow(start: true, icon: Icons.chevron_right, tooltip: tr('Page précédente'),
              onPressed: _current > 0 ? () => _goRelative(-1) : null),
          _arrow(start: false, icon: Icons.chevron_left, tooltip: tr('Page suivante'),
              onPressed: _current < _repo.mushafPages.length - 1 ? () => _goRelative(1) : null),
        ]),
      );
    });
  }

  Widget _page(BuildContext context, int page, Size size, Settings settings, TextScaler scaler) {
    final store = context.watch<ProgressStore>();
    final audio = context.watch<AudioController>();
    final cs = context.colors;
    final segs = _segments(page);
    final f = _fitFont(page, size, settings.fontSize, scaler);
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
              // Ne défile que si la page ne tient pas même avec le plus petit texte.
              physics: const ClampingScrollPhysics(),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final (surah, ayahs) in segs) ...[
                  if (ayahs.first == 1) ...[
                    SurahTitleBox(name: surah.name, height: _titleH - 8),
                    if (surah.number != 9) Text(basmala, textAlign: TextAlign.center, style: quranStyle(f, cs.onSurface)),
                  ],
                  Text.rich(
                    TextSpan(
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
                      ),
                    ),
                    textAlign: TextAlign.justify,
                    style: quranStyle(f, cs.onSurface),
                  ),
                ],
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
