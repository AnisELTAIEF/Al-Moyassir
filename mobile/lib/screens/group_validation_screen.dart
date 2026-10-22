import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_service.dart';
import '../core/i18n.dart';
import '../core/quran_repository.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Valider la mémorisation de plusieurs élèves d'un coup : on choisit la classe, on décoche les absents, on indique
/// les pages ou le passage déjà appris, et on valide pour tous ceux qui restent cochés.
class GroupValidationScreen extends StatefulWidget {
  const GroupValidationScreen({super.key, required this.orgId, required this.orgName, required this.students});
  final String orgId, orgName;
  final List<StudentRef> students;

  @override
  State<GroupValidationScreen> createState() => _GroupValidationScreenState();
}

enum _Kind { pages, passage }

class _GroupValidationScreenState extends State<GroupValidationScreen> {
  late final QuranRepository _repo = context.read<QuranRepository>();
  String? _class; // null = tous
  final Set<String> _absent = {};
  _Kind _kind = _Kind.pages;
  final _pFrom = TextEditingController(text: '1');
  final _pTo = TextEditingController(text: '1');
  int _surah = 1;
  final _aFrom = TextEditingController(text: '1');
  final _aTo = TextEditingController(text: '1');
  String _result = 'acquired';
  bool _busy = false;
  String? _msg;

  @override
  void dispose() {
    for (final c in [_pFrom, _pTo, _aFrom, _aTo]) {
      c.dispose();
    }
    super.dispose();
  }

  List<String> get _classes => ({for (final s in widget.students) ...s.classes}.toList()..sort());
  List<StudentRef> get _list => widget.students.where((s) => _class == null || s.classes.contains(_class)).toList();
  List<StudentRef> get _chosen => _list.where((s) => !_absent.contains(s.id)).toList();

  int _num(TextEditingController c, int min, int max) => (int.tryParse(c.text.trim()) ?? min).clamp(min, max);

  Future<void> _apply() async {
    final Map<String, dynamic> what;
    if (_kind == _Kind.pages) {
      final a = _num(_pFrom, 1, 604), b = _num(_pTo, 1, 604);
      what = {'pages': [for (var p = a < b ? a : b; p <= (a < b ? b : a); p++) p]};
    } else {
      final n = _repo.surah(_surah).ayahCount;
      final a = _num(_aFrom, 1, n), b = _num(_aTo, 1, n);
      what = {'ranges': [{'surah': _surah, 'from': a < b ? a : b, 'to': a < b ? b : a}]};
    }
    final ids = [for (final s in _chosen) s.id];
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      final r = await context.read<AuthService>().api!.post('/orgs/${widget.orgId}/validation/bulk', {'studentIds': ids, 'result': _result, ...what}) as Map<String, dynamic>;
      final errors = (r['errors'] as num?)?.toInt() ?? 0;
      setState(() => _msg = errors == 0
          ? tr('{n} élèves mis à jour.', {'n': (r['changed'] as num?)?.toInt() ?? 0})
          : tr('{n} élèves mis à jour, {e} refusé(s).', {'n': (r['changed'] as num?)?.toInt() ?? 0, 'e': errors}));
    } on ApiException catch (e) {
      setState(() => _msg = e.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final list = _list;
    final chosen = _chosen;
    final surah = _repo.surah(_surah);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Validation groupée'))),
      body: SafeArea(
        child: Constrained(
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
            Text(widget.orgName, style: TextStyle(color: context.tones.muted)),
            if (_classes.length > 1) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                ChoiceChip(label: Text(tr('Tous')), selected: _class == null, onSelected: (_) => setState(() => _class = null)),
                for (final c in _classes) ChoiceChip(label: Text(c), selected: _class == c, onSelected: (_) => setState(() => _class = c)),
              ]),
            ],
            SectionTitle(tr('Élèves présents : {n} sur {t}', {'n': chosen.length, 't': list.length})),
            Row(children: [
              TextButton(onPressed: () => setState(() => _absent.removeAll(list.map((s) => s.id))), child: Text(tr('Tout cocher'))),
              TextButton(onPressed: () => setState(() => _absent.addAll(list.map((s) => s.id))), child: Text(tr('Tout décocher'))),
            ]),
            for (final s in list)
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                value: !_absent.contains(s.id),
                title: Text(s.fullName),
                onChanged: (v) => setState(() => v == true ? _absent.remove(s.id) : _absent.add(s.id)),
              ),
            SectionTitle(tr('Ce qui est appris')),
            SegmentedButton<_Kind>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: _Kind.pages, label: Text(tr('Pages'))),
                ButtonSegment(value: _Kind.passage, label: Text(tr('Passage'))),
              ],
              selected: {_kind},
              onSelectionChanged: (v) => setState(() => _kind = v.first),
            ),
            const SizedBox(height: 12),
            if (_kind == _Kind.pages)
              Row(children: [
                Expanded(child: TextField(controller: _pFrom, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('de la page (1–604)')))),
                const SizedBox(width: 12),
                Expanded(child: TextField(controller: _pTo, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('à la page')))),
              ])
            else ...[
              DropdownButtonFormField<int>(
                initialValue: _surah,
                isExpanded: true,
                decoration: InputDecoration(labelText: tr('Sourate')),
                items: [for (final s in _repo.surahs) DropdownMenuItem(value: s.number, child: Text('${s.number} · ${s.name}'))],
                onChanged: (v) => setState(() {
                  _surah = v ?? 1;
                  _aFrom.text = '1';
                  _aTo.text = '${_repo.surah(_surah).ayahCount}';
                }),
              ),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextField(controller: _aFrom, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('de l’ayah (1–{n})', {'n': surah.ayahCount})))),
                const SizedBox(width: 12),
                Expanded(child: TextField(controller: _aTo, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('à l’ayah')))),
              ]),
            ],
            const SizedBox(height: 16),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 'acquired', label: Text(tr('Acquis'))),
                ButtonSegment(value: 'acquired_error', label: Text(tr('Avec erreur'))),
                ButtonSegment(value: 'review', label: Text(tr('À revoir'))),
              ],
              selected: {_result},
              onSelectionChanged: (v) => setState(() => _result = v.first),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _busy || chosen.isEmpty ? null : _apply,
              icon: const Icon(Icons.fact_check_outlined),
              label: Text(tr('Valider pour {n} élèves', {'n': chosen.length})),
            ),
            if (_msg != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_msg!, style: TextStyle(color: context.colors.primary, fontWeight: FontWeight.w600))),
          ]),
        ),
      ),
    );
  }
}
