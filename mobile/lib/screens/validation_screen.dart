import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth_service.dart';
import '../core/i18n.dart';
import '../core/quran_repository.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/ayah_coloring.dart';
import '../widgets/common.dart';
import '../widgets/mushaf_jump.dart';
import 'mushaf_reader.dart';

/// Séance de validation : l'enseignant ouvre le mushaf d'un élève et marque ce qu'il a récité.
///
/// Un toucher sur un ayah change son résultat (acquis → acquis avec erreur → à revoir → effacé) ; « Page acquise »
/// valide toute la page d'un coup. À partir du seuil d'ayat avec erreur sur une page, elle est « à reprendre » et
/// l'élève en est notifié. L'enseignant ne voit JAMAIS la progression personnelle de l'élève : seulement ses validations.
class ValidationScreen extends StatefulWidget {
  const ValidationScreen({super.key, required this.orgId, required this.student});
  final String orgId;
  final StudentRef student;

  @override
  State<ValidationScreen> createState() => _ValidationScreenState();
}

class _ValidationScreenState extends State<ValidationScreen> {
  late final QuranRepository _repo = context.read<QuranRepository>();
  late final ValidationSession _session =
      ValidationSession(context.read<AuthService>(), _repo, orgId: widget.orgId, student: widget.student);
  int _page = 1;
  bool _opened = false;
  (int, int) _start = (1, 1);
  Key _readerKey = UniqueKey(); // renouvelée pour « Aller à »

  @override
  void initState() {
    super.initState();
    _session.load().then((_) {
      if (!mounted) return;
      // On reprend là où l'élève en est : première page pas encore complète.
      var p = 1;
      while (p < _repo.mushafPages.length && _session.pageComplete(p)) {
        p++;
      }
      _page = p;
      _start = _repo.mushafPages[p - 1];
      setState(() => _opened = true);
    });
  }

  @override
  void dispose() {
    _session.dispose();
    super.dispose();
  }

  /// Page, sourate ou juz : l'enseignant va directement là où l'élève récite (sans tourner 604 pages).
  Future<void> _jump() async {
    final to = await showMushafJump(context, currentPage: _page);
    if (to == null || !mounted) return;
    setState(() {
      _start = to;
      _page = _repo.mushafPageOf(to.$1, to.$2);
      _readerKey = UniqueKey();
    });
  }

  Future<void> _setPage(ValResult? r) async {
    final err = await _session.setPage(_page, r);
    if (err != null && mounted) snack(context, err);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.student.fullName, style: const TextStyle(fontSize: 18)),
          ListenableBuilder(
            listenable: _session,
            builder: (_, _) => Text(tr('{n} ayat validés · seuil {t} erreurs par page', {'n': _session.validated, 't': _session.threshold}),
                style: TextStyle(fontSize: 12, color: context.tones.muted, fontWeight: FontWeight.w400)),
          ),
        ]),
        actions: [
          if (_opened) IconButton(tooltip: tr('Aller à une page ou une sourate'), icon: const Icon(Icons.travel_explore), onPressed: _jump),
          IconButton(tooltip: tr('Légende des couleurs'), icon: const Icon(Icons.palette_outlined), onPressed: () => showValidationLegend(context)),
        ],
      ),
      body: !_opened
          ? Center(
              child: _session.error != null
                  ? EmptyState(icon: Icons.error_outline, title: _session.error!, action: FilledButton(onPressed: _session.load, child: Text(tr('Réessayer'))))
                  : const CircularProgressIndicator(),
            )
          : Column(children: [
              Expanded(
                child: MushafReader(
                  key: _readerKey,
                  surah: _start.$1,
                  ayah: _start.$2,
                  session: _session,
                  onShown: (s, a) => setState(() => _page = _repo.mushafPageOf(s, a)),
                ),
              ),
              _PageBar(page: _page, session: _session, onJump: _jump, onAccept: () => _setPage(ValResult.acquired), onClear: () => _setPage(null)),
            ]),
    );
  }
}

/// Barre du bas : valider ou effacer toute la page affichée.
class _PageBar extends StatelessWidget {
  const _PageBar({required this.page, required this.session, required this.onJump, required this.onAccept, required this.onClear});
  final int page;
  final ValidationSession session;
  final VoidCallback onJump, onAccept, onClear;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.colors.surface,
      elevation: 2,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: ListenableBuilder(
            listenable: session,
            builder: (context, _) => Row(children: [
              // Toucher le numéro de page ouvre « Aller à » (page, sourate, juz).
              Expanded(
                child: InkWell(
                  onTap: onJump,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      Flexible(
                        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(tr('Page {n}', {'n': page}), maxLines: 1, softWrap: false, style: const TextStyle(fontWeight: FontWeight.w600)),
                          if (session.isRetake(page))
                            Text(tr('à reprendre'), maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.tones.red)),
                        ]),
                      ),
                      const Icon(Icons.arrow_drop_down),
                    ]),
                  ),
                ),
              ),
              IconButton(onPressed: onClear, tooltip: tr('Effacer la page'), icon: const Icon(Icons.layers_clear_outlined)),
              const SizedBox(width: 4),
              FilledButton.icon(onPressed: onAccept, icon: const Icon(Icons.check), label: Text(tr('Page acquise'))),
            ]),
          ),
        ),
      ),
    );
  }
}
