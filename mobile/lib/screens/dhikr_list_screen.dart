import 'package:flutter/material.dart';

import '../core/adhkar_data.dart';
import '../core/i18n.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Lecture d'un recueil d'adhkâr : chaque invocation a un compteur (on tape pour répéter).
class DhikrListScreen extends StatefulWidget {
  const DhikrListScreen({super.key, required this.set});
  final DhikrSet set;

  @override
  State<DhikrListScreen> createState() => _DhikrListScreenState();
}

class _DhikrListScreenState extends State<DhikrListScreen> {
  late List<int> _done = List<int>.filled(widget.set.items.length, 0);

  void _tap(int i) {
    final max = widget.set.items[i].count;
    setState(() => _done[i] = _done[i] >= max ? 0 : _done[i] + 1);
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.set.items;
    final completed = [for (var i = 0; i < items.length; i++) if (_done[i] >= items[i].count) i].length;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.set.fr),
        actions: [
          IconButton(
            tooltip: tr('Réinitialiser'),
            onPressed: () => setState(() => _done = List<int>.filled(items.length, 0)),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Constrained(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: ThinBar(value: items.isEmpty ? 0 : completed / items.length),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) => _card(context, items[i], i),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _card(BuildContext context, Dhikr d, int i) {
    final done = _done[i] >= d.count;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => _tap(i),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            ArabicText(d.arabic, size: 26, height: 2.1, justify: true, color: done ? context.tones.muted : context.colors.onSurface),
            if (d.translation != null) ...[
              const SizedBox(height: 10),
              Text(d.translation!, style: TextStyle(color: context.tones.muted, height: 1.4)),
            ],
            const SizedBox(height: 12),
            Row(children: [
              if (d.source != null) ...[
                Icon(Icons.bookmark_border, size: 15, color: context.tones.muted),
                const SizedBox(width: 4),
                Expanded(child: Text(d.source!, style: TextStyle(fontSize: 12, color: context.tones.muted))),
              ] else
                const Spacer(),
              _counter(context, d, i, done),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _counter(BuildContext context, Dhikr d, int i, bool done) {
    if (done) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: context.colors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.check_circle, size: 18, color: context.colors.primary),
          const SizedBox(width: 6),
          Text(tr('Fait'), style: TextStyle(color: context.colors.primary, fontWeight: FontWeight.w600)),
        ]),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: context.colors.primary),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        d.count > 1 ? '${_done[i]} / ${d.count}' : tr('Toucher'),
        style: TextStyle(color: context.colors.primary, fontWeight: FontWeight.w700),
      ),
    );
  }
}
