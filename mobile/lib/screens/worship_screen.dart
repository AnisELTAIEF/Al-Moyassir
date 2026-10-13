import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/adhkar_data.dart';
import '../core/i18n.dart';
import '../core/prayer_service.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'dhikr_list_screen.dart';

/// Onglet « Prière » : horaires de prière du jour + recueils d'adhkâr et de du'as.
class WorshipScreen extends StatelessWidget {
  const WorshipScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Prière & adhkâr')),
          bottom: TabBar(
            tabs: [
              Tab(text: tr('Horaires')),
              Tab(text: tr('Adhkâr & du‘â’')),
            ],
          ),
        ),
        body: SafeArea(
          top: false,
          child: Constrained(
            child: TabBarView(
              children: [
                const _PrayerTimesTab(),
                _AdhkarTab(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AdhkarTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          for (final set in kAdhkar)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DhikrListScreen(set: set))),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(color: context.colors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                        child: Icon(set.icon, color: context.colors.primary),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          ArabicText(set.ar, size: 22, height: 1.4),
                          Text(set.fr, style: TextStyle(color: context.tones.muted)),
                        ]),
                      ),
                      Text('${set.items.length}', style: TextStyle(color: context.tones.muted)),
                      const SizedBox(width: 6),
                      const Icon(Icons.chevron_right),
                    ]),
                  ),
                ),
              ),
            ),
        ],
      );
}

class _PrayerTimesTab extends StatelessWidget {
  const _PrayerTimesTab();

  String _hm(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  String _left(Duration d) {
    final h = d.inHours, m = d.inMinutes % 60;
    if (h > 0) return tr('dans {h} h {m} min', {'h': h, 'm': m});
    return tr('dans {m} min', {'m': d.inMinutes});
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PrayerService>();
    final next = p.next;
    final now = DateTime.now();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // Lieu + réglages.
        Row(children: [
          Icon(Icons.place_outlined, size: 18, color: context.tones.muted),
          const SizedBox(width: 6),
          Expanded(child: Text(p.place, style: TextStyle(color: context.tones.muted))),
          TextButton.icon(
            onPressed: () => _openSettings(context),
            icon: const Icon(Icons.tune, size: 18),
            label: Text(tr('Réglages')),
          ),
        ]),
        const SizedBox(height: 8),
        // Prochaine prière.
        if (next != null)
          Card(
            color: context.colors.primary,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr('Prochaine prière'), style: TextStyle(color: context.colors.onPrimary.withValues(alpha: 0.85))),
                const SizedBox(height: 6),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ArabicText(next.$1.ar, size: 30, color: context.colors.onPrimary, height: 1.3),
                      Text(next.$1.fr, style: TextStyle(color: context.colors.onPrimary.withValues(alpha: 0.85))),
                    ]),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(_hm(next.$2), style: TextStyle(color: context.colors.onPrimary, fontSize: 32, fontWeight: FontWeight.w700)),
                    Text(_left(next.$2.difference(now)), style: TextStyle(color: context.colors.onPrimary.withValues(alpha: 0.85))),
                  ]),
                ]),
              ]),
            ),
          ),
        const SizedBox(height: 14),
        // Les horaires du jour.
        Card(
          child: Column(children: [
            for (final s in Salat.values)
              _row(context, s, p.times[s], highlight: next?.$1 == s),
          ]),
        ),
      ],
    );
  }

  Widget _row(BuildContext context, Salat s, DateTime? t, {required bool highlight}) {
    final color = highlight ? context.colors.primary : null;
    return Container(
      decoration: BoxDecoration(
        color: highlight ? context.colors.primary.withValues(alpha: 0.08) : null,
        border: Border(bottom: BorderSide(color: context.tones.line)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      child: Row(children: [
        Icon(s.isPrayer ? Icons.circle : Icons.wb_sunny_outlined, size: s.isPrayer ? 8 : 18, color: color ?? context.tones.muted),
        const SizedBox(width: 12),
        Expanded(child: Text(s.fr, style: TextStyle(fontWeight: highlight ? FontWeight.w700 : FontWeight.w500, color: color))),
        ArabicText(s.ar, size: 20, color: color ?? context.colors.onSurface, height: 1.3),
        const SizedBox(width: 14),
        Text(t == null ? '—' : _hm(t), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: color)),
      ]),
    );
  }

  void _openSettings(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _PrayerSettingsSheet(),
    );
  }
}

class _PrayerSettingsSheet extends StatefulWidget {
  const _PrayerSettingsSheet();
  @override
  State<_PrayerSettingsSheet> createState() => _PrayerSettingsSheetState();
}

class _PrayerSettingsSheetState extends State<_PrayerSettingsSheet> {
  bool _locating = false;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PrayerService>();
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 8, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('Horaires de prière'), style: context.text.titleLarge),
          const SizedBox(height: 16),
          // Localisation.
          Text(tr('Lieu'), style: context.text.titleMedium),
          const SizedBox(height: 8),
          Text(p.place, style: TextStyle(color: context.tones.muted)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _locating ? null : () => _detect(context),
                icon: _locating
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location),
                label: Text(tr('Me localiser')),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          DropdownButtonFormField<City>(
            initialValue: null,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('Ou choisir une ville')),
            items: [for (final c in kCities) DropdownMenuItem(value: c, child: Text(c.label, overflow: TextOverflow.ellipsis))],
            onChanged: (c) {
              if (c != null) context.read<PrayerService>().setCity(c);
            },
          ),
          const Divider(height: 32),
          // Méthode de calcul.
          Text(tr('Méthode de calcul'), style: context.text.titleMedium),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: kMethods.containsKey(p.method) ? p.method : null,
            isExpanded: true,
            items: [for (final e in kMethods.entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis))],
            onChanged: (m) {
              if (m != null) context.read<PrayerService>().setMethod(m);
            },
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(tr('‘Asr selon l’école hanafite')),
            subtitle: Text(tr('Ombre doublée (par défaut : standard)')),
            value: p.hanafi,
            onChanged: (v) => context.read<PrayerService>().setHanafi(v),
          ),
          const Divider(height: 32),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(tr('Rappel à l’heure de la prière')),
            subtitle: Text(tr('Alerte quand l’app est ouverte')),
            value: p.remind,
            onChanged: (v) => context.read<PrayerService>().setRemind(v),
          ),
        ]),
      ),
    );
  }

  Future<void> _detect(BuildContext context) async {
    setState(() => _locating = true);
    final err = await context.read<PrayerService>().detectLocation();
    if (!context.mounted) return;
    setState(() => _locating = false);
    if (err != null) snack(context, tr(err));
  }
}
