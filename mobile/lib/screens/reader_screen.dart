import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';

import '../core/audio_cache.dart';
import '../core/audio_controller.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../core/screen_wakelock.dart';
import '../core/settings.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/khatam.dart';
import '../widgets/surah_actions.dart';
import '../widgets/tafsir_view.dart';
import '../widgets/tajweed_view.dart';
import 'account_screen.dart';
import '../widgets/ayah_coloring.dart';
import '../widgets/islamic_frame.dart';
import '../widgets/mushaf_jump.dart';
import 'mushaf_reader.dart';
import '../core/i18n.dart';

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({super.key, required this.surah, this.initialAyah = 1});
  final int surah;
  final int initialAyah;
  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  final _scroll = ItemScrollController();
  final _positions = ItemPositionsListener.create();
  late final AudioController _audio;
  late final Settings _settings;
  int? _lastFollowed;
  late int _surahNo = widget.surah; // change en mode mushaf quand la page passe à une autre sourate
  late int _here = widget.initialAyah; // premier ayah visible (liste) ou premier ayah de la page
  bool _immersive = false;
  Key _mushafKey = UniqueKey(); // renouvelée pour « Aller à la page »

  /// Qira'a : saute à une page, une sourate ou un juz du mushaf.
  Future<void> _goToPage() async {
    final repo = context.read<QuranRepository>();
    final to = await showMushafJump(context, currentPage: repo.mushafPageOf(_surahNo, _here));
    if (to == null || !mounted) return;
    final (s, a) = to;
    setState(() {
      _surahNo = s;
      _here = a;
      _mushafKey = UniqueKey();
    });
    _settings.saveLastRead(s, a);
  }

  /// Navigation « sourate précédente / suivante » : ouvre une autre sourate à son début.
  void _goToSurah(int n) {
    if (n < 1 || n > 114 || n == _surahNo) return;
    setState(() {
      _surahNo = n;
      _here = 1;
      _lastFollowed = null;
      _mushafKey = UniqueKey();
    });
    _settings.saveLastRead(n, 1);
  }

  @override
  void initState() {
    super.initState();
    _audio = context.read<AudioController>();
    _settings = context.read<Settings>();
    _audio.addListener(_follow);
    _positions.itemPositions.addListener(_rememberPosition);
    ScreenWakelock.acquire(this); // écran de lecture ouvert : garder l'écran allumé
    // Activité en cours (pour « Prochaine étape » sur l'accueil), dès l'ouverture.
    _settings.saveActivity(_settings.readingMode == ReadingMode.mushaf ? Activity.qiraa : Activity.tahfidh, _surahNo, _here);
  }

  /// Qira'a : zoom du texte (0 = page entière). Message bref pour indiquer le niveau atteint.
  void _zoom(int delta) {
    final next = (_settings.mushafZoom + delta).clamp(0, Settings.mushafZoomMax);
    if (next == _settings.mushafZoom) return;
    _settings.mushafZoom = next;
    final msg = next == 0
        ? tr('Page entière')
        : tr('Texte agrandi : {p} % — faites défiler la page', {'p': (_settings.mushafZoomFactor * 100).round()});
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), duration: const Duration(milliseconds: 1400)));
  }

  void _setImmersive(bool v) {
    setState(() => _immersive = v);
    SystemChrome.setEnabledSystemUIMode(v ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge);
  }

  @override
  void dispose() {
    if (_immersive) SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _audio.removeListener(_follow);
    _positions.itemPositions.removeListener(_rememberPosition);
    ScreenWakelock.release(this); // sortie de l'écran de lecture
    super.dispose();
  }

  // Index 0 = en-tête ; index n = ayah n.
  void _rememberPosition() {
    final visible = _positions.itemPositions.value.where((p) => p.itemTrailingEdge > 0.05 && p.index > 0);
    if (visible.isEmpty) return;
    final first = visible.map((p) => p.index).reduce((a, b) => a < b ? a : b);
    _here = first;
    _settings.saveLastRead(_surahNo, first);
    _settings.saveActivity(Activity.tahfidh, _surahNo, first);
  }

  void _follow() {
    if (_audio.surah != _surahNo || _settings.readingMode != ReadingMode.ayah) return;
    final a = _audio.currentAyah;
    if (a == null || a == _lastFollowed || !_scroll.isAttached) return;
    _lastFollowed = a;
    _scroll.scrollTo(index: a, alignment: 0.12, duration: const Duration(milliseconds: 400), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final surah = context.read<QuranRepository>().surah(_surahNo);
    final settings = context.watch<Settings>();
    final fontSize = settings.fontSize;
    final store = context.watch<ProgressStore>();
    final audio = context.watch<AudioController>();
    final painter = AyahPainter(context,
        settings: settings, store: store, validations: context.watch<ValidationStore>(), paper: Theme.of(context).scaffoldBackgroundColor);
    final memorized = store.memorizedIn(surah.number);
    final complete = memorized == surah.ayahCount;

    final mode = settings.readingMode;
    final pageMode = mode == ReadingMode.mushaf;
    final div = context.read<QuranRepository>().divisions;

    return Scaffold(
      appBar: _immersive
          ? null
          : AppBar(
        titleSpacing: 0,
        // Qira'a : barre réduite à une ligne pour laisser la place à la page du mushaf.
        toolbarHeight: pageMode ? 42 : null,
        title: pageMode
            ? Text('سُورَةُ ${surah.name}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 19, height: 1.3))
            : Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text('سُورَةُ ${surah.name}', style: const TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 22, height: 1.35)),
                Text(tr('Sourate {n} · {m}/{t} appris', {'n': surah.number, 'm': memorized, 't': surah.ayahCount}),
                    style: TextStyle(fontSize: 12, color: context.tones.muted)),
              ]),
        bottom: pageMode ? null : PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: SegmentedButton<ReadingMode>(
              showSelectedIcon: false,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: [
                for (final m in ReadingMode.values)
                  ButtonSegment(value: m, icon: Icon(m.icon, size: 18), label: Text(m.label), tooltip: m.description),
              ],
              selected: {mode},
              onSelectionChanged: (s) => settings.readingMode = s.first,
            ),
          ),
        ),
        actions: [
          // Qira'a : agrandir / réduire le texte, toujours à portée de pouce.
          if (pageMode) ...[
            IconButton(
              tooltip: tr('Réduire le texte (jusqu’à la page entière)'),
              visualDensity: VisualDensity.compact,
              onPressed: settings.mushafZoom > 0 ? () => _zoom(-1) : null,
              icon: const Icon(Icons.text_decrease),
            ),
            IconButton(
              tooltip: tr('Agrandir le texte'),
              visualDensity: VisualDensity.compact,
              onPressed: settings.mushafZoom < Settings.mushafZoomMax ? () => _zoom(1) : null,
              icon: const Icon(Icons.text_increase),
            ),
          ],
          ColoringLegendButton(settings: settings),
          IconButton(
            tooltip: complete ? tr('Sourate apprise — options') : tr('Marquer toute la sourate comme apprise'),
            onPressed: () => complete ? showSurahMenu(context, surah.number) : setWholeSurah(context, surah.number, AyahStatus.memorized),
            icon: Icon(complete ? Icons.check_circle : Icons.done_all, color: complete ? context.tones.gold : null),
          ),
          PopupMenuButton<String>(
            tooltip: tr('Plus d’options'),
            onSelected: (v) {
              if (v == 'surah') showSurahMenu(context, surah.number);
              final m = ReadingMode.values.asNameMap()[v];
              if (m != null) settings.readingMode = m;
              if (v == 'full') _setImmersive(true);
              if (v == 'goto') _goToPage();
              if (v == 'prevSurah') _goToSurah(_surahNo - 1);
              if (v == 'nextSurah') _goToSurah(_surahNo + 1);
              if (v == 'hizb') {
                final h = div.hizbOf(surah.number, _here.clamp(1, surah.ayahCount));
                final start = div.hizbStart(h);
                showRangeMenu(context,
                    title: divisionName(hizb: h),
                    subtitle: tr('Depuis {surah} {ayah}', {'surah': context.read<QuranRepository>().surah(start.$1).name, 'ayah': start.$2}),
                    refs: div.ayahsOfHizb(h));
              }
              if (v == 'settings') Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen()));
              if (v == 'theme') toggleTheme(context);
              if (v == 'tajweed') settings.tajweed = !settings.tajweed;
              if (v == 'legend') showTajweedLegend(context);
              if (v == 'coloring') showColoringSettings(context, mode);
              if (pageMode && (v == 'bigger' || v == 'smaller')) {
                _zoom(v == 'bigger' ? 1 : -1);
              } else if (v == 'bigger' || v == 'smaller') {
                // Pas de 2 ; jusqu'à 72 sur tablette, 48 sur téléphone (comme dans Compte).
                final max = MediaQuery.sizeOf(context).shortestSide >= 600 ? 72.0 : 48.0;
                settings.fontSize = (settings.fontSize + (v == 'bigger' ? 2 : -2)).clamp(20.0, max);
              }
            },
            itemBuilder: (_) => [
              if (pageMode) PopupMenuItem(value: ReadingMode.ayah.name, child: ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: Icon(ReadingMode.ayah.icon), title: Text(tr('Passer en Tahfidh')))),
              if (pageMode) PopupMenuItem(value: 'goto', child: Text(tr('Aller à la page…'))),
              if (pageMode && _surahNo > 1) PopupMenuItem(value: 'prevSurah', child: ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.skip_next), title: Text(tr('Sourate précédente')))),
              if (pageMode && _surahNo < 114) PopupMenuItem(value: 'nextSurah', child: ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.skip_previous), title: Text(tr('Sourate suivante')))),
              if (pageMode) PopupMenuItem(value: 'full', child: Text(tr('Plein écran'))),
              PopupMenuItem(value: 'surah', child: Text(tr('Suivi de toute la sourate…'))),
              PopupMenuItem(value: 'hizb', child: Text(tr('Suivi du hizb en cours…'))),
              PopupMenuItem(value: 'bigger', child: ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.text_increase), title: Text(tr('Texte plus grand')))),
              PopupMenuItem(value: 'smaller', child: ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.text_decrease), title: Text(tr('Texte plus petit')))),
              PopupMenuItem(value: 'coloring', child: Text(tr('Colorisation des ayat…'))),
              CheckedPopupMenuItem(value: 'tajweed', checked: settings.tajweed, child: Text(tr('Couleurs du tajwid'))),
              PopupMenuItem(value: 'legend', child: Text(tr('Légende du tajwid'))),
              PopupMenuItem(value: 'theme', child: Text(Theme.of(context).brightness == Brightness.dark ? tr('Mode clair') : tr('Mode sombre'))),
              PopupMenuItem(value: 'settings', child: Text(tr('Taille du texte et récitateur'))),
            ],
          ),
        ],
      ),
      body: Stack(children: [
        Column(children: [
        Expanded(
          child: mode == ReadingMode.mushaf
              ? MushafReader(
                  key: _mushafKey,
                  surah: surah.number,
                  ayah: _here,
                  onShown: (s, a) {
                    _here = a;
                    _settings.saveLastRead(s, a);
                    _settings.saveActivity(Activity.qiraa, s, a);
                    if (s != _surahNo) setState(() => _surahNo = s);
                  },
                )
              : ScrollablePositionedList.builder(
            key: ValueKey('list-${surah.number}'),
            initialScrollIndex: _here <= 1 ? 0 : _here.clamp(1, surah.ayahCount),
            itemScrollController: _scroll,
            itemPositionsListener: _positions,
            itemCount: surah.ayahCount + 1,
            padding: const EdgeInsets.only(bottom: 24),
            itemBuilder: (context, i) {
              if (i == 0) return _SurahHeader(surah: surah, memorized: memorized);
              final status = store.statusOf(surah.number, i);
              final playing = audio.surah == surah.number && audio.currentAyah == i;
              final h = div.hizbStartingAt(surah.number, i);
              // Toute la largeur de l'écran, y compris sur tablette.
              final block = _AyahBlock(
                  surah: surah.number,
                  ayah: i,
                  text: surah.ayahs[i - 1],
                  fontSize: fontSize,
                  tajweed: settings.tajweed,
                  marker: div.markerIn(surah.number, i)?.$1,
                  status: status,
                  playing: playing,
                  painter: painter,
              );
              return h == null ? block : Column(children: [_HizbBanner(hizb: h), block]);
            },
          ),
        ),
        // Tahfidh : barre « sourate précédente / suivante ». Qira'a : le mushaf passe d'une sourate à
        // l'autre en feuilletant ; la navigation par sourate y est dans le menu ⋮ (place laissée au texte).
        if (!_immersive && !pageMode)
          _SurahNav(
            surah: surah,
            onPrev: _surahNo > 1 ? () => _goToSurah(_surahNo - 1) : null,
            onNext: _surahNo < 114 ? () => _goToSurah(_surahNo + 1) : null,
          ),
        if (!_immersive) _MiniPlayer(surah: surah.number, startAyah: _surahNo == widget.surah ? widget.initialAyah : 1, compact: pageMode),
      ]),
        if (_immersive)
          PositionedDirectional(
            top: MediaQuery.paddingOf(context).top + 4,
            end: 8,
            child: IconButton.filledTonal(
              tooltip: tr('Quitter le plein écran'),
              onPressed: () => _setImmersive(false),
              icon: const Icon(Icons.fullscreen_exit),
            ),
          ),
      ]),
    );
  }
}

/// Barre de navigation entre sourates (feuilletage « précédente / suivante »), sous le texte.
class _SurahNav extends StatelessWidget {
  const _SurahNav({required this.surah, required this.onPrev, required this.onNext});
  final Surah surah;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.colors.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: context.tones.line))),
        child: Row(children: [
          IconButton(
            tooltip: tr('Sourate précédente'),
            visualDensity: VisualDensity.compact,
            onPressed: onPrev,
            icon: const Icon(Icons.chevron_left),
          ),
          Expanded(
            child: Center(
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('${surah.number}', style: TextStyle(fontSize: 12.5, color: context.tones.muted)),
                const SizedBox(width: 8),
                ArabicText('سُورَةُ ${surah.name}', size: 17, height: 1.2),
              ]),
            ),
          ),
          IconButton(
            tooltip: tr('Sourate suivante'),
            visualDensity: VisualDensity.compact,
            onPressed: onNext,
            icon: const Icon(Icons.chevron_right),
          ),
        ]),
      ),
    );
  }
}

/// Cartouche d'en-tête de la sourate.
class _SurahHeader extends StatelessWidget {
  const _SurahHeader({required this.surah, required this.memorized});
  final Surah surah;
  final int memorized;

  @override
  Widget build(BuildContext context) {
    final cs = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: CustomPaint(
        // Même cadre ornemental que les pages du mushaf, sur fond vert.
        painter: IslamicFramePainter(gold: context.tones.gold, accent: context.tones.gold, paper: cs.primary, band: 10),
        child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 22),
        child: Column(children: [
          Row(children: [
            KhatamBadge(label: '${surah.number}', size: 34, stroke: context.tones.gold, textColor: cs.onPrimary),
            Expanded(child: Center(child: ArabicText('سُورَةُ ${surah.name}', size: 30, height: 1.6, color: cs.onPrimary))),
            KhatamBadge(label: '${surah.ayahCount}', size: 34, stroke: context.tones.gold, textColor: cs.onPrimary, semanticLabel: tr('{n} ayat', {'n': surah.ayahCount})),
          ]),
          const SizedBox(height: 10),
          ThinBar(value: memorized / surah.ayahCount, color: context.tones.gold, height: 5),
          const SizedBox(height: 6),
          Text(
              context.watch<Settings>().coloring == AyahColoring.mastery
                  ? tr('{m} / {n} ayat appris · touchez un ayah pour changer son niveau, appui long pour l’écouter', {'m': memorized, 'n': surah.ayahCount})
                  : tr('{m} / {n} ayat appris · touchez un ayah pour l’écouter ou le marquer', {'m': memorized, 'n': surah.ayahCount}),
              textAlign: TextAlign.center, style: TextStyle(color: cs.onPrimary.withValues(alpha: 0.85), fontSize: 12.5)),
        ]),
      ),
      ),
    );
  }
}

class _AyahBlock extends StatelessWidget {
  const _AyahBlock({required this.surah, required this.ayah, required this.text, required this.fontSize, required this.tajweed, this.marker, required this.status, required this.playing, required this.painter});
  final int surah, ayah;
  final String text;
  final double fontSize;
  final bool tajweed;
  final int? marker;
  final AyahStatus? status;
  final bool playing;
  final AyahPainter painter;

  @override
  Widget build(BuildContext context) {
    final cs = context.colors;
    final tones = context.tones;
    final markerFill = status == AyahStatus.memorized ? cs.primary : null;
    final markerStroke = status == null ? tones.muted.withValues(alpha: 0.6) : cs.primary;
    // Marques de l'élève sur le médaillon (colorisation par maîtrise, ou vue combinée « Validation »).
    final mastery = painter.studentTags ? painter.masteryOf(surah, ayah) : null;
    final label = masteryLabel(mastery ?? painter.masteryOf(surah, ayah)); // lecture d'écran
    final bg = painter.background(surah, ayah, isPlaying: playing);
    void sheet() => showAyahSheet(context, surah, ayah, text);

    return Semantics(
      button: true,
      label: tr('Ayah {n}, {label}', {'n': ayah, 'label': label}),
      hint: mastery != null ? tr('Toucher : niveau suivant. Appui long : options.') : null,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: mastery != null ? () => cycleAyahMastery(context, surah, ayah) : sheet,
        onLongPress: sheet,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(16),
            // Ayah récité : cadre doré en plus du fond, pour rester distinct de toute colorisation.
            border: playing
                ? Border.all(color: tones.gold, width: 2)
                : Border(
                    right: BorderSide(
                        color: mastery == null && status == AyahStatus.learning ? tones.red.withValues(alpha: 0.7) : Colors.transparent, width: 3)),
          ),
          child: Text.rich(
            TextSpan(children: [
              ...ayahSpans(context, text, tajweed: tajweed, isFirstAyahs: ayah <= 2, markerWord: marker),
              const TextSpan(text: ' '),
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: mastery != null
                    ? masteryBadge(context, mastery, label: arabicDigits(ayah), size: fontSize * 1.15, colorBlind: painter.settings.colorBlind)
                    : KhatamBadge(
                        label: arabicDigits(ayah),
                        size: fontSize * 1.15,
                        fill: markerFill,
                        stroke: markerStroke,
                        textColor: markerFill != null ? cs.onPrimary : cs.onSurface,
                      ),
              ),
            ]),
            textDirection: TextDirection.rtl,
            textAlign: TextAlign.justify,
            style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: fontSize, height: 2.1, color: cs.onSurface),
          ),
        ),
      ),
    );
  }
}

/// Feuille d'actions d'un ayah : écouter, répéter, marquer.
Future<void> showAyahSheet(BuildContext context, int surah, int ayah, String text) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    // Défilante : le tafsir peut être long.
    builder: (c) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.9),
      child: SingleChildScrollView(child: _AyahSheet(surah: surah, ayah: ayah, text: text)),
    ),
  );
}

class _AyahSheet extends StatelessWidget {
  const _AyahSheet({required this.surah, required this.ayah, required this.text});
  final int surah, ayah;
  final String text;

  @override
  Widget build(BuildContext context) {
    final store = context.watch<ProgressStore>();
    final audio = context.read<AudioController>();
    final status = store.statusOf(surah, ayah);
    final p = store.get(surah, ayah);
    final tajweed = context.watch<Settings>().tajweed;

    // Mêmes 4 niveaux que la colorisation « par maîtrise » et l'écran Révision.
    final level = store.storedMasteryOf(surah, ayah);
    Widget levelChip(Mastery value, IconData icon) => ChoiceChip(
          avatar: Icon(icon, size: 18),
          label: Text(masteryLabel(value)),
          selected: level == value,
          showCheckmark: false,
          onSelected: (_) => store.setMastery(surah, ayah, value),
        );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(tr('Ayah {n}', {'n': ayah}), style: context.text.titleLarge),
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 140),
            child: SingleChildScrollView(
              child: Text.rich(
                TextSpan(children: tajweedSpans(context, text, enabled: tajweed, isFirstAyahs: ayah <= 2)),
                textDirection: TextDirection.rtl,
                style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 24, height: 1.9, color: context.colors.onSurface),
              ),
            ),
          ),
          if (tajweed) AyahTajweedSection(text: text, isFirstAyahs: ayah <= 2),
          AyahTafsirSection(surah: surah, ayah: ayah),
          const SizedBox(height: 16),
          Text(tr('Écouter'), style: context.text.labelLarge?.copyWith(color: context.tones.muted)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () {
                  audio.setMode(PlayMode.continuous);
                  audio.play(surah, ayah);
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.play_arrow_rounded),
                // Récitateur sans minutages : on ne sait pas où commence l'ayah, la sourate part du début.
                label: Text(audio.timed ? tr('À partir d’ici') : tr('Toute la sourate')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: !audio.timed ? null : () {
                  audio.setMode(PlayMode.singleAyah);
                  if (audio.repeatTarget == 1) audio.setRepeat(3);
                  audio.play(surah, ayah);
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.repeat),
                label: Text(tr('Répéter ×{n}', {'n': audio.repeatTarget == 1 ? 3 : audio.repeatTarget == 0 ? '∞' : audio.repeatTarget})),
              ),
            ),
          ]),
          const SizedBox(height: 18),
          Text(tr('Mémorisation'), style: context.text.labelLarge?.copyWith(color: context.tones.muted)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            levelChip(Mastery.none, Icons.radio_button_unchecked),
            levelChip(Mastery.learning, Icons.timelapse),
            levelChip(Mastery.acquired, Icons.check_circle_outline),
            levelChip(Mastery.review, Icons.replay),
          ]),
          if (ayah > 1) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                Navigator.pop(context);
                final before = store.snapshotSurah(surah);
                await store.setRange(surah, List.generate(ayah, (i) => i + 1), AyahStatus.memorized);
                messenger
                  ..hideCurrentSnackBar()
                  ..showSnackBar(SnackBar(
                    content: Text(tr('Ayat 1 à {n} marqués appris', {'n': ayah})),
                    action: SnackBarAction(label: tr('Annuler'), onPressed: () => store.restoreSurah(surah, before)),
                    persist: false,
                    duration: const Duration(seconds: 6),
                  ));
              },
              icon: const Icon(Icons.playlist_add_check),
              label: Text(tr('Appris du début de la sourate jusqu’ici (1–{n})', {'n': ayah})),
            ),
          ],
          if (status == AyahStatus.memorized) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {
                store.markReviewed(surah, ayah);
                context.read<Settings>().saveActivity(Activity.review, surah, ayah);
                Navigator.pop(context);
                snack(context, tr('Révision enregistrée'));
              },
              icon: const Icon(Icons.replay),
              label: Text(p != null && p.reviewCount > 0 ? tr('J’ai révisé cet ayah ({n} fois)', {'n': p.reviewCount}) : tr('J’ai révisé cet ayah')),
            ),
          ],
        ]),
      ),
    );
  }
}

class _MiniPlayer extends StatelessWidget {
  const _MiniPlayer({required this.surah, required this.startAyah, this.compact = false});
  final int surah;
  final int startAyah;

  /// Qira'a : lecteur réduit (environ 48 px au lieu de 68) pour laisser la place au texte.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final audio = context.watch<AudioController>();
    final here = audio.surah == surah;
    final cs = context.colors;
    final available = audio.reciter.hasSurah(surah);

    return Material(
      color: cs.surface,
      elevation: 10,
      shadowColor: Colors.black26,
      child: SafeArea(
        top: false,
        child: Constrained(
          child: Padding(
            padding: compact ? const EdgeInsets.fromLTRB(8, 2, 4, 2) : const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Theme(
              data: compact ? Theme.of(context).copyWith(visualDensity: VisualDensity.compact) : Theme.of(context),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (audio.error != null)
                Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(audio.error!, style: TextStyle(color: cs.error, fontSize: 12.5))),
              Row(children: [
                audio.loading
                    ? SizedBox.square(dimension: compact ? 44 : 52, child: const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 3)))
                    : IconButton.filled(
                        iconSize: compact ? 24 : 30,
                        visualDensity: compact ? VisualDensity.compact : null,
                        tooltip: here && audio.playing ? tr('Pause') : tr('Écouter'),
                        onPressed: !available ? null : () => here ? audio.toggle() : audio.play(surah, startAyah),
                        icon: Icon(here && audio.playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
                      ),
                SizedBox(width: 10),
                Expanded(
                  child: InkWell(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AccountScreen())),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      Text(audio.reciter.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleSmall, textDirection: TextDirection.rtl),
                      Text(
                        !available
                            ? tr('Sourate indisponible pour ce récitateur')
                            : here && audio.currentAyah != null
                                ? (audio.mode == PlayMode.singleAyah ? tr('Ayah {n} · répétition {i}/{t}', {'n': audio.currentAyah, 'i': audio.repeatsDone + 1, 't': audio.repeatTarget == 0 ? '∞' : audio.repeatTarget}) : tr('Ayah {n}', {'n': audio.currentAyah}))
                                : here && !audio.timed && audio.duration != null
                                    ? '${clock(audio.position)} / ${clock(audio.duration!)} · ${tr('sans suivi des ayat')}'
                                    : tr('Riwaya de Qalun · changer de récitateur'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: compact ? 11.5 : 12, color: context.tones.muted),
                      ),
                    ]),
                  ),
                ),
                if (audio.timed) ...[
                  IconButton(tooltip: tr('Ayah précédent'), onPressed: here ? audio.previous : null, icon: Icon(Icons.skip_previous_rounded)),
                  IconButton(tooltip: tr('Ayah suivant'), onPressed: here ? audio.next : null, icon: Icon(Icons.skip_next_rounded)),
                ] else ...[
                  IconButton(tooltip: tr('Reculer de 15 s'), onPressed: here ? audio.previous : null, icon: Icon(Icons.replay_rounded)),
                  IconButton(tooltip: tr('Avancer de 15 s'), onPressed: here ? audio.next : null, icon: Icon(Icons.forward_rounded)),
                ],
                if (available && context.watch<AudioCache>().ready) // pas d'audio hors ligne sur la version web
                  Consumer<AudioCache>(
                    builder: (context, cache, _) {
                      final rid = audio.reciter.id;
                      if (cache.isDownloading(rid, surah)) {
                        final p = cache.progress(rid, surah);
                        return SizedBox(
                          width: 48,
                          height: 48,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: CircularProgressIndicator(strokeWidth: 2.6, value: (p == null || p == 0) ? null : p),
                          ),
                        );
                      }
                      final cached = cache.isCached(rid, surah);
                      return IconButton(
                        tooltip: cached ? tr('Téléchargé — appuyez pour supprimer') : tr('Télécharger pour l’écoute hors ligne'),
                        icon: Icon(cached ? Icons.download_done_rounded : Icons.download_outlined, color: cached ? cs.primary : null),
                        onPressed: () => _toggleDownload(context, cache, audio.reciter, surah),
                      );
                    },
                  ),
                if (audio.timed)
                PopupMenuButton<int>(
                  tooltip: tr('Répétition'),
                  icon: Icon(audio.mode == PlayMode.singleAyah ? Icons.repeat_one_rounded : Icons.repeat_rounded,
                      color: audio.mode == PlayMode.singleAyah ? cs.primary : null),
                  onSelected: (v) {
                    if (v == -1) {
                      audio.setMode(PlayMode.continuous);
                    } else {
                      audio.setMode(PlayMode.singleAyah);
                      audio.setRepeat(v);
                    }
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(value: -1, child: Text(tr('Lecture continue'))),
                    PopupMenuItem(value: 1, child: Text(tr('Répéter l’ayah ×1'))),
                    PopupMenuItem(value: 3, child: Text(tr('Répéter l’ayah ×3'))),
                    PopupMenuItem(value: 5, child: Text(tr('Répéter l’ayah ×5'))),
                    PopupMenuItem(value: 10, child: Text(tr('Répéter l’ayah ×10'))),
                    PopupMenuItem(value: 0, child: Text(tr('Répéter sans fin'))),
                  ],
                ),
              ]),
              // Sans minutages : la barre de progression permet de retrouver un passage.
              if (here && !audio.timed && (audio.duration?.inMilliseconds ?? 0) > 0)
                SizedBox(
                  height: compact ? 22 : 28,
                  child: Slider(
                    value: audio.position.inMilliseconds.clamp(0, audio.duration!.inMilliseconds).toDouble(),
                    max: audio.duration!.inMilliseconds.toDouble(),
                    onChanged: (v) => audio.seekTo(Duration(milliseconds: v.round())),
                  ),
                ),
            ]),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _toggleDownload(BuildContext context, AudioCache cache, Reciter reciter, int surah) async {
    if (cache.isCached(reciter.id, surah)) {
      await cache.remove(reciter.id, surah);
      if (context.mounted) snack(context, tr('Téléchargement supprimé'));
      return;
    }
    try {
      await cache.download(reciter.id, surah, reciter.audioUri(surah));
      if (context.mounted) snack(context, tr('Sourate disponible hors ligne'));
    } catch (_) {
      if (context.mounted) snack(context, tr('Téléchargement impossible (connexion ?)'));
    }
  }
}

/// Bandeau au début d'un hizb (et d'un juz) ; le toucher ouvre le suivi du hizb.
class _HizbBanner extends StatelessWidget {
  const _HizbBanner({required this.hizb});
  final int hizb;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final div = repo.divisions;
    final juz = hizb.isOdd ? (hizb + 1) ~/ 2 : null;
    final refs = div.ayahsOfHizb(hizb);
    final (m, _) = context.watch<ProgressStore>().countIn(refs);
    final start = div.hizbStart(hizb);
    final label = juz != null ? '${divisionName(juz: juz)} · ${divisionName(hizb: hizb)}' : divisionName(hizb: hizb);
    final ar = juz != null ? 'الجزء ${arabicDigits(juz)} · الحزب ${arabicDigits(hizb)}' : 'الحزب ${arabicDigits(hizb)}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
      child: Material(
        color: context.tones.gold.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => showRangeMenu(context,
              title: divisionName(hizb: hizb),
              subtitle: tr('Depuis {surah} {ayah}', {'surah': repo.surah(start.$1).name, 'ayah': start.$2}),
              refs: refs),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Row(children: [
              Text('۞', style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 22, color: context.tones.gold, height: 1.3)),
              const SizedBox(width: 10),
              Expanded(
                child: I18n.isAr
                    ? Text(ar, style: const TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 19, height: 1.4))
                    : Text(label, style: context.text.titleSmall),
              ),
              Text(tr('{m}/{n} appris', {'m': m, 'n': refs.length}), style: TextStyle(fontSize: 12, color: context.tones.muted)),
              const SizedBox(width: 6),
              Icon(m == refs.length ? Icons.check_circle : Icons.more_horiz, size: 20, color: m == refs.length ? context.tones.gold : context.tones.muted),
            ]),
          ),
        ),
      ),
    );
  }
}

/// « 1:05:09 » ou « 12:08 ».
String clock(Duration d) {
  String two(int n) => n.toString().padLeft(2, '0');
  final h = d.inHours, m = d.inMinutes % 60, sec = d.inSeconds % 60;
  return h > 0 ? '$h:${two(m)}:${two(sec)}' : '$m:${two(sec)}';
}
