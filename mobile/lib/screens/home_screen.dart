import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth_service.dart';
import '../core/duas.dart';
import '../core/models.dart';
import '../core/prayer_service.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/mosaic.dart';
import 'account_screen.dart';
import 'khatma_planner_screen.dart';
import 'notifications_screen.dart';
import 'reader_screen.dart';
import 'teacher_students_screen.dart';
import '../core/i18n.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onOpenTab});
  final void Function(int tab) onOpenTab;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<QuranRepository>();
    final store = context.watch<ProgressStore>();
    final auth = context.watch<AuthService>();
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
                if (auth.signedIn) ...[const SizedBox(width: 4), const _NotificationsBell()],
                const SizedBox(width: 4),
                IconButton.filledTonal(
                  tooltip: tr('Compte et réglages'),
                  iconSize: 26,
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen())),
                  icon: Icon(auth.signedIn ? Icons.person : Icons.person_outline),
                ),
              ]),
              const SizedBox(height: 16),
              // Rappel : reprendre la dernière activité, avec une suggestion ; puis l'invocation du jour.
              _NextStepCard(onOpenTab: onOpenTab, toReview: toReview),
              const SizedBox(height: 12),
              // Enseignant / administratif : la validation de la mémorisation en un toucher.
              if (auth.validatingOrgs.isNotEmpty) ...[
                _ValidateCard(orgs: auth.validatingOrgs),
                const SizedBox(height: 12),
              ],
              _DuaCard(name: firstName(auth.user?.displayName)),
              const SizedBox(height: 14),
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
                    subtitle: Text(tr('Retrouvez votre progression sur tous vos appareils et rejoignez votre groupe.')),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen())),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              _NextPrayerCard(onTap: () => onOpenTab(3)),
              const SizedBox(height: 14),
              Card(
                child: ListTile(
                  leading: Icon(Icons.hourglass_bottom_rounded, color: context.colors.primary),
                  title: Text(tr('Estimer ma khatma')),
                  subtitle: Text(tr('Combien de temps pour terminer le Coran à votre rythme ?')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const KhatmaPlannerScreen())),
                ),
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

/// Raccourci « Valider la mémorisation » (sinon : Compte → Mes établissements → Valider).
/// Un seul établissement : sa liste d'élèves s'ouvre directement ; plusieurs : on choisit d'abord.
class _ValidateCard extends StatelessWidget {
  const _ValidateCard({required this.orgs});
  final List<MyOrg> orgs;

  void _openOrg(BuildContext context, MyOrg o) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => TeacherStudentsScreen(orgId: o.id, orgName: o.name)));

  Future<void> _open(BuildContext context) async {
    if (orgs.length == 1) return _openOrg(context, orgs.single);
    final o = await showModalBottomSheet<MyOrg>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(tr('Valider la mémorisation'), style: context.text.titleMedium)),
          for (final o in orgs)
            ListTile(
              leading: Icon(o.isMosque ? Icons.mosque_outlined : Icons.apartment_outlined, color: context.colors.primary),
              title: Text(o.name),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.pop(sheet, o),
            ),
        ]),
      ),
    );
    if (o != null && context.mounted) _openOrg(context, o);
  }

  @override
  Widget build(BuildContext context) => Card(
        color: context.colors.primary.withValues(alpha: 0.08),
        child: ListTile(
          contentPadding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
          leading: Icon(Icons.fact_check_outlined, color: context.colors.primary, size: 30),
          title: Text(tr('Valider la mémorisation'), style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(orgs.length == 1 ? orgs.single.name : tr('{n} établissements', {'n': orgs.length})),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _open(context),
        ),
      );
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

/// Cloche des notifications de l'enseignant, avec le nombre de non lues.
class _NotificationsBell extends StatelessWidget {
  const _NotificationsBell();

  @override
  Widget build(BuildContext context) {
    final unread = context.select<ValidationStore, int>((v) => v.unread);
    return IconButton(
      tooltip: tr('Notifications'),
      iconSize: 26,
      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen())),
      icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_outlined)),
    );
  }
}

class _NextPrayerCard extends StatelessWidget {
  const _NextPrayerCard({required this.onTap});
  final VoidCallback onTap;

  String _hm(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PrayerService>();
    final next = p.next;
    final left = next?.$2.difference(DateTime.now());
    final sub = left == null
        ? p.place
        : (left.inHours > 0
            ? tr('dans {h} h {m} min', {'h': left.inHours, 'm': left.inMinutes % 60})
            : tr('dans {m} min', {'m': left.inMinutes}));
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Icon(Icons.mosque_outlined, color: context.colors.primary),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(next == null ? tr('Horaires de prière') : tr('{p} à {t}', {'p': I18n.isAr ? next.$1.ar : next.$1.fr, 't': _hm(next.$2)}),
                    style: context.text.titleMedium),
                Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: context.tones.muted)),
              ]),
            ),
            if (next != null) ArabicText(next.$1.ar, size: 24, height: 1.4, color: context.colors.primary),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right),
          ]),
        ),
      ),
    );
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

/// « Prochaine étape » : reprendre la dernière activité (Qira'a, Tahfidh ou Révision) et une
/// suggestion de ce qu'il serait utile de faire ensuite.
class _NextStepCard extends StatelessWidget {
  const _NextStepCard({required this.onOpenTab, required this.toReview});
  final void Function(int tab) onOpenTab;
  final int toReview;

  void _read(BuildContext context, ReadingMode mode, int surah, int ayah) {
    context.read<Settings>().readingMode = mode;
    Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: surah, initialAyah: ayah)));
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final store = context.watch<ProgressStore>();
    final repo = context.read<QuranRepository>();
    final cs = context.colors;
    final last = settings.lastRead;
    // Dernière activité ; à défaut (versions précédentes), la dernière lecture.
    final act = settings.lastActivity ??
        (last == null
            ? null
            : LastActivity(settings.readingMode == ReadingMode.mushaf ? Activity.qiraa : Activity.tahfidh, last.$1, last.$2,
                DateTime.now()));

    if (act == null) {
      return FilledButton.icon(
        onPressed: () => onOpenTab(1),
        icon: const Icon(Icons.menu_book),
        label: Text(tr('Commencer la lecture')),
      );
    }

    final (title, icon) = switch (act.kind) {
      Activity.qiraa => (tr('Reprendre la Qira’a'), Icons.auto_stories_outlined),
      Activity.tahfidh => (tr('Reprendre le Tahfidh'), Icons.record_voice_over_outlined),
      Activity.review => (tr('Reprendre la révision'), Icons.replay),
    };
    void resume() => switch (act.kind) {
          Activity.qiraa => _read(context, ReadingMode.mushaf, act.surah, act.ayah),
          Activity.tahfidh => _read(context, ReadingMode.ayah, act.surah, act.ayah),
          Activity.review => onOpenTab(2),
        };

    // Suggestion : réviser ce qui est dû, sinon continuer ce qui est en cours de mémorisation.
    final learning = store.all.where((p) => p.status == AyahStatus.learning).toList()
      ..sort((a, b) => a.surah != b.surah ? a.surah.compareTo(b.surah) : a.ayah.compareTo(b.ayah));
    String? hint;
    VoidCallback? go;
    String? goLabel;
    if (toReview > 0 && act.kind != Activity.review) {
      hint = tr('{n} ayat à réviser aujourd’hui pour ne pas les oublier.', {'n': toReview});
      goLabel = tr('Réviser');
      go = () => onOpenTab(2);
    } else if (learning.isNotEmpty && act.kind != Activity.tahfidh) {
      final p = learning.first;
      hint = tr('Continuer la mémorisation : {s}, ayah {a}.', {'s': repo.surah(p.surah).name, 'a': p.ayah});
      goLabel = tr('Mémoriser');
      go = () => _read(context, ReadingMode.ayah, p.surah, p.ayah);
    } else if (act.kind == Activity.review && toReview == 0) {
      hint = tr('Révisions à jour. Et si vous mémorisiez un nouveau passage ?');
      goLabel = tr('Tahfidh');
      go = () => _read(context, ReadingMode.ayah, act.surah, act.ayah);
    }

    return Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: resume,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: cs.primary, borderRadius: BorderRadius.circular(16)),
                child: Icon(Icons.play_arrow_rounded, color: cs.onPrimary, size: 32),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Icon(icon, size: 18, color: cs.primary),
                    const SizedBox(width: 6),
                    Flexible(child: Text(title, style: context.text.titleMedium)),
                  ]),
                  Text(tr('Sourate {s}, ayah {a} · {t}', {'s': act.surah, 'a': act.ayah, 't': since(act.at)}),
                      style: TextStyle(color: context.tones.muted)),
                ]),
              ),
              ArabicText(repo.surah(act.surah).name, size: 24, height: 1.4),
            ]),
          ),
        ),
        if (hint != null) ...[
          Divider(height: 1, color: context.tones.line),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
            child: Row(children: [
              Icon(Icons.lightbulb_outline, size: 18, color: context.tones.gold),
              const SizedBox(width: 8),
              Expanded(child: Text(hint, style: context.text.bodySmall)),
              TextButton(onPressed: go, child: Text(goLabel!)),
            ]),
          ),
        ],
      ]),
    );
  }
}

/// Invocation du jour, au prénom de l'utilisateur connecté.
class _DuaCard extends StatefulWidget {
  const _DuaCard({required this.name});
  final String? name;

  @override
  State<_DuaCard> createState() => _DuaCardState();
}

class _DuaCardState extends State<_DuaCard> {
  int _offset = 0;

  @override
  Widget build(BuildContext context) {
    final d = duaOfDay(DateTime.now(), widget.name, offset: _offset);
    return Card(
      color: context.tones.gold.withValues(alpha: 0.10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(Icons.volunteer_activism_outlined, size: 18, color: context.tones.gold),
            const SizedBox(width: 8),
            Expanded(child: Text(widget.name == null ? tr('Invocation du jour') : tr('Une invocation pour vous'), style: context.text.titleSmall)),
            IconButton(
              tooltip: tr('Une autre invocation'),
              visualDensity: VisualDensity.compact,
              onPressed: () => setState(() => _offset++),
              icon: const Icon(Icons.refresh, size: 20),
            ),
          ]),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(d.ar,
                textDirection: TextDirection.rtl,
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 24, height: 1.8, color: context.colors.onSurface)),
          ),
          if (!I18n.isAr)
            Padding(
              padding: const EdgeInsets.only(right: 8, top: 2),
              child: Text(d.fr, textAlign: TextAlign.center, style: TextStyle(color: context.tones.muted, fontStyle: FontStyle.italic)),
            ),
        ]),
      ),
    );
  }
}
