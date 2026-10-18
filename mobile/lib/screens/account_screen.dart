import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/audio_cache.dart';
import '../core/audio_controller.dart';
import '../core/api_client.dart';
import '../core/auth_service.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/ayah_coloring.dart';
import '../widgets/tajweed_view.dart';
import 'login_screen.dart';
import 'my_orgs_screen.dart';
import '../core/i18n.dart';

/// Compte (connexion / profil / groupes) et réglages.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final settings = context.watch<Settings>();
    final audio = context.watch<AudioController>();
    final repo = context.read<QuranRepository>();

    return Scaffold(
      appBar: AppBar(title: Text(tr('Compte et réglages'))),
      body: Constrained(
        maxWidth: 620,
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
          if (!auth.signedIn)
            Card(child: Padding(padding: EdgeInsets.all(18), child: LoginPanel()))
          else ...[
            _Profile(auth: auth),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: Icon(Icons.apartment_outlined, color: context.colors.primary),
                title: Text(tr('Mes établissements')),
                subtitle: Text(tr('Associations, mosquées et rattachement d’un élève')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MyOrgsScreen())),
              ),
            ),
          ],
          SectionTitle(tr('Affichage')),
          Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(tr('Langue de l’interface'), style: context.text.titleSmall),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: 'system', label: Text(tr('Auto'))),
                    const ButtonSegment(value: 'fr', label: Text('Français')),
                    const ButtonSegment(value: 'ar', label: Text('العربية')),
                  ],
                  selected: {settings.language},
                  onSelectionChanged: (s) => settings.language = s.first,
                ),
                const SizedBox(height: 16),
                Text(tr('Thème'), style: context.text.titleSmall),
                const SizedBox(height: 8),
                SegmentedButton<ThemeMode>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: ThemeMode.system, label: Text(tr('Auto'))),
                    ButtonSegment(value: ThemeMode.light, label: Text(tr('Clair'))),
                    ButtonSegment(value: ThemeMode.dark, label: Text(tr('Sombre'))),
                  ],
                  selected: {settings.themeMode},
                  onSelectionChanged: (s) => settings.themeMode = s.first,
                ),
                const SizedBox(height: 16),
                Text(tr('Mode de lecture'), style: context.text.titleSmall),
                RadioGroup<ReadingMode>(
                  groupValue: settings.readingMode,
                  onChanged: (m) => m == null ? null : settings.readingMode = m,
                  child: Column(children: [
                    for (final m in ReadingMode.values)
                      RadioListTile<ReadingMode>(value: m, title: Text(m.label), subtitle: Text(m.description), secondary: Icon(m.icon), dense: true, contentPadding: EdgeInsets.zero),
                  ]),
                ),
                const SizedBox(height: 8),
                Text(tr('Taille du texte coranique'), style: context.text.titleSmall),
                Builder(builder: (context) {
                  // Tablette : tailles plus grandes possibles.
                  final max = MediaQuery.sizeOf(context).shortestSide >= 600 ? 72.0 : 48.0;
                  return Slider(
                    value: settings.fontSize.clamp(20, max),
                    min: 20,
                    max: max,
                    divisions: ((max - 20) / 2).round(),
                    label: settings.fontSize.round().toString(),
                    onChanged: (v) => settings.fontSize = v,
                  );
                }),
                Text.rich(
                  TextSpan(children: tajweedSpans(context, 'اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ', enabled: settings.tajweed, isFirstAyahs: true)),
                  textDirection: TextDirection.rtl,
                  style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: settings.fontSize, height: 2, color: context.colors.onSurface),
                ),
                const Divider(height: 24),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.format_color_fill),
                  title: Text(tr('Colorisation des ayat')),
                  subtitle: Text([
                    for (final m in ReadingMode.values)
                      '${m.label} : ${settings.coloringIn(m).label}${settings.tajweedIn(m) ? tr(' + tajwid') : ''}',
                  ].join(' · ')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => showColoringSettings(context, settings.readingMode),
                ),
                Text(tr('Tajwid : règles générales et spécificités de Qalun (madd munfasil, sila du mim al-jam‘, tas-hil…). Touchez un ayah pour l’explication.'),
                    style: context.text.bodySmall?.copyWith(color: context.tones.muted)),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(onPressed: () => showTajweedLegend(context), icon: const Icon(Icons.palette_outlined), label: Text(tr('Légende du tajwid'))),
                ),
              ]),
            ),
          ),
          SectionTitle(tr('Récitateur — riwaya de Qalun')),
          Card(
            child: RadioGroup<String>(
              groupValue: audio.reciter.id,
              onChanged: (v) => v == null ? null : audio.setReciter(v),
              child: Column(children: [
                for (final r in repo.reciters)
                  RadioListTile<String>(
                    value: r.id,
                    title: Text(r.name, textDirection: TextDirection.rtl, textAlign: TextAlign.left),
                    subtitle: Text([
                      r.surahs.length < 114 ? tr('Source : {src} · {n} sourates', {'src': r.source, 'n': r.surahs.length}) : tr('Source : {src}', {'src': r.source}),
                      if (!r.timed) tr('sourate entière, sans suivi des ayat'),
                    ].join(' · ')),
                  ),
              ]),
            ),
          ),
          if (context.watch<AudioCache>().ready) ...[
          SectionTitle(tr('Audio hors ligne')),
          Card(
            child: Consumer<AudioCache>(
              builder: (context, cache, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                ListTile(
                  leading: const Icon(Icons.offline_pin_outlined),
                  title: Text(tr('Récitations téléchargées')),
                  subtitle: Text(cache.count == 0
                      ? tr('Aucune. Dans une sourate, touchez l’icône ⤓ pour l’écouter hors ligne.')
                      : tr('{n} sourate(s) · {size}', {'n': cache.count, 'size': _fmtSize(cache.totalBytes)})),
                ),
                if (cache.count > 0)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final n = cache.count, size = _fmtSize(cache.totalBytes);
                          if (await confirm(context,
                              title: tr('Vider le cache audio ?'),
                              body: tr('Les {n} sourate(s) téléchargées ({size}) seront supprimées de ce téléphone.', {'n': n, 'size': size}),
                              ok: tr('Vider'))) {
                            await cache.clear();
                          }
                        },
                        icon: const Icon(Icons.delete_outline),
                        label: Text(tr('Vider le cache audio')),
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Text(
                    tr('Téléchargements réservés à votre écoute hors ligne personnelle. Chaque enregistrement appartient à son éditeur ; aucune redistribution.'),
                    style: TextStyle(fontSize: 12.5, color: context.tones.muted),
                  ),
                ),
              ]),
            ),
          ),
          ],
          SectionTitle(tr('Sources et licences')),
          Text(
            tr('Texte : مصحف الأوقاف الليبية برواية قالون (6214 ayat), diffusé avec le projet qalun-timing ; ses conditions propres s’appliquent (usage non commercial signalé comme gratuit ; usage commercial soumis à autorisation).\n\nMinutages des ayat : Abdeljawad Almiladi, qalun-timing.abdeljawad.com — licence CC BY 4.0.\n\nAudio : chaque enregistrement appartient à son éditeur et est lu en streaming depuis son hébergement.\n\nPages du mode Mushaf (604) : données « Qaloon » du Complexe du roi Fahd (KFGQPC, مصحف المدينة برواية قالون), alignées sur le texte libyen.\n\nPolices : Scheherazade New (SIL) et Readex Pro — licence OFL.'),
            style: TextStyle(fontSize: 12.5, color: context.tones.muted),
          ),
        ]),
      ),
    );
  }
}

String _fmtSize(int bytes) {
  if (bytes >= 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
  if (bytes >= 1024) return '${(bytes / 1024).toStringAsFixed(0)} Ko';
  return '$bytes o';
}

class _Profile extends StatelessWidget {
  const _Profile({required this.auth});
  final AuthService auth;

  @override
  Widget build(BuildContext context) {
    final u = auth.user!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: context.colors.primary,
              child: Text(u.displayName.isEmpty ? '?' : u.displayName.characters.first.toUpperCase(),
                  style: TextStyle(color: context.colors.onPrimary, fontSize: 22, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(u.displayName, style: context.text.titleLarge),
                Text(u.email, style: TextStyle(color: context.tones.muted)),
              ]),
            ),
            if (u.isAdmin) Chip(label: Text(tr('Admin')), visualDensity: VisualDensity.compact, backgroundColor: context.tones.gold.withValues(alpha: 0.25)),
          ]),
          if (auth.groups.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(tr('Mes groupes'), style: context.text.titleSmall),
            for (final g in auth.groups)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: Icon(g.isGroupAdmin ? Icons.admin_panel_settings_outlined : Icons.group_outlined),
                title: Text(g.name),
                subtitle: Text(g.isGroupAdmin ? tr('Admin du groupe · {n} membres', {'n': g.members}) : tr('Membre · les admins du groupe voient votre progression')),
              ),
          ],
          const SizedBox(height: 6),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => _join(context),
              icon: const Icon(Icons.group_add_outlined),
              label: Text(tr('Rejoindre un groupe avec un code')),
            ),
          ),
          const SizedBox(height: 4),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _rename(context),
                icon: const Icon(Icons.edit_outlined),
                label: Text(tr('Modifier le nom')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  if (await confirm(context, title: tr('Se déconnecter ?'), body: tr('Votre progression reste enregistrée sur le serveur.'), ok: tr('Se déconnecter'))) {
                    await auth.signOut();
                  }
                },
                icon: const Icon(Icons.logout),
                label: Text(tr('Se déconnecter')),
              ),
            ),
          ]),
        ]),
      ),
    );
  }

  Future<void> _join(BuildContext context) async {
    final c = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(tr('Rejoindre un groupe')),
        content: TextField(
          controller: c,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          style: const TextStyle(fontSize: 20, letterSpacing: 2, fontWeight: FontWeight.w600),
          decoration: InputDecoration(hintText: 'H7KQ2M', helperText: tr('Code du groupe, ou code d’invitation reçu')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(tr('Annuler'))),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: Text(tr('Rejoindre'))),
        ],
      ),
    );
    if (code == null || code.isEmpty || !context.mounted) return;
    try {
      final name = await auth.joinGroup(code);
      if (context.mounted) snack(context, tr('Vous avez rejoint « {g} ».', {'g': name}));
    } on ApiException catch (e) {
      if (context.mounted) snack(context, e.message);
    }
  }

  Future<void> _rename(BuildContext context) async {
    final c = TextEditingController(text: auth.user!.displayName);
    final name = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(tr('Votre nom')),
        content: TextField(controller: c, autofocus: true, decoration: InputDecoration(helperText: tr('Visible par les admins de vos groupes'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(tr('Annuler'))),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: Text(tr('Enregistrer'))),
        ],
      ),
    );
    if (name == null || name.length < 2) return;
    try {
      await auth.updateName(name);
    } catch (e) {
      if (context.mounted) snack(context, '$e');
    }
  }
}
