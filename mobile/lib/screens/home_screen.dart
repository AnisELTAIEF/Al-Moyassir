import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth_service.dart';
import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/mosaic.dart';
import 'account_screen.dart';
import 'reader_screen.dart';
import '../core/i18n.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onOpenTab});
  final void Function(int tab) onOpenTab;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    final auth = context.watch<AuthService>();
    final last = context.watch<Settings>().lastRead;
    final memorized = store.memorizedCount;
    final counts = [0, for (final s in repo.surahs) s.ayahCount];
    final toReview = store.all.where((p) => p.status == AyahStatus.memorized && (p.needsReview || p.isDue())).length;
    final name = auth.user?.displayName.split(' ').first;

    return Scaffold(
      body: SafeArea(
        child: Constrained(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('السلام عليكم', style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 26, color: context.colors.primary, height: 1.5)),
                    Text(name == null || name.isEmpty ? tr('Bienvenue') : name, style: context.text.headlineMedium),
                  ]),
                ),
                IconButton(
                  tooltip: Theme.of(context).brightness == Brightness.dark ? tr('Passer en mode clair') : tr('Passer en mode sombre'),
                  iconSize: 26,
                  onPressed: () => toggleTheme(context),
                  icon: Icon(Theme.of(context).brightness == Brightness.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
                ),
                const SizedBox(width: 4),
                IconButton.filledTonal(
                  tooltip: tr('Compte et réglages'),
                  iconSize: 26,
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen())),
                  icon: Icon(auth.signedIn ? Icons.person : Icons.person_outline),
                ),
              ]),
              const SizedBox(height: 20),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tr('Votre khatma'), style: context.text.titleLarge),
                    const SizedBox(height: 4),
                    Text.rich(TextSpan(children: [
                      TextSpan(text: '$memorized', style: TextStyle(fontWeight: FontWeight.w700, color: context.colors.primary)),
                      TextSpan(text: tr(' ayat appris sur {total} · {p}', {'total': QuranRepository.totalAyahs, 'p': pct(memorized, QuranRepository.totalAyahs)})),
                    ]), style: TextStyle(color: context.tones.muted)),
                    const SizedBox(height: 16),
                    KhatmaMosaic(
                      memorized: store.memorizedPerSurah(),
                      ayahCounts: counts,
                      onTap: (n) => _open(context, n, 1),
                    ),
                    const SizedBox(height: 12),
                    _Legend(),
                  ]),
                ),
              ),
              if (!auth.signedIn) ...[
                const SizedBox(height: 14),
                Card(
                  color: context.colors.primary.withValues(alpha: 0.08),
                  child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
                    leading: Icon(Icons.person_add_alt_1_outlined, color: context.colors.primary),
                    title: Text(tr('Créer un compte ou se connecter')),
                    subtitle: Text(auth.enabled
                        ? tr('Retrouvez votre progression sur tous vos appareils et rejoignez votre groupe.')
                        : tr('Mode local : touchez ici pour renseigner le serveur de votre groupe, puis créer votre compte.')),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen())),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              if (last != null)
                Card(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () => _open(context, last.$1, last.$2),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(color: context.colors.primary, borderRadius: BorderRadius.circular(16)),
                          child: Icon(Icons.play_arrow_rounded, color: context.colors.onPrimary, size: 32),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(tr('Reprendre la lecture'), style: context.text.titleMedium),
                            Text(tr('Sourate {s}, ayah {a}', {'s': last.$1, 'a': last.$2}), style: TextStyle(color: context.tones.muted)),
                          ]),
                        ),
                        ArabicText(repo.surah(last.$1).name, size: 24, height: 1.4),
                      ]),
                    ),
                  ),
                )
              else
                FilledButton.icon(
                  onPressed: () => onOpenTab(1),
                  icon: const Icon(Icons.menu_book),
                  label: Text(tr('Commencer la lecture')),
                ),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: _Stat(value: '$toReview', label: tr('à réviser'), icon: Icons.replay, onTap: () => onOpenTab(2))),
                const SizedBox(width: 12),
                Expanded(child: _Stat(value: '${store.learningCount}', label: tr('en cours'), icon: Icons.timelapse, onTap: () => onOpenTab(2))),
              ]),
              if (store.syncError != null) ...[
                const SizedBox(height: 12),
                Text(store.syncError!, style: TextStyle(color: context.tones.muted, fontSize: 12), textAlign: TextAlign.center),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _open(BuildContext context, int surah, int ayah) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: surah, initialAyah: ayah)));
}

class _Legend extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    Widget dot(Color c, String l) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 12, height: 12, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 6),
          Text(l, style: TextStyle(fontSize: 12, color: context.tones.muted)),
        ]);
    return Wrap(spacing: 16, runSpacing: 6, children: [
      dot(context.tones.line, tr('À commencer')),
      dot(Color.lerp(context.tones.line, context.colors.primary, 0.6)!, tr('En partie')),
      dot(context.tones.gold, tr('Sourate complète')),
    ]);
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.icon, required this.onTap});
  final String value, label;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Icon(icon, color: context.colors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(value, style: context.text.titleLarge),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: context.tones.muted)),
                ]),
              ),
            ]),
          ),
        ),
      );
}
