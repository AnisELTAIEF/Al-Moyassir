import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../core/push_service.dart';
import 'reader_screen.dart';
import 'results_screen.dart';

/// Centre de notifications : ce que l'enseignant a signalé (pages à reprendre, ayat à revoir).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<ValidationStore>().refresh());
  }

  String _title(AppNotification n) => switch (n.kind) {
        'retake_pages' => tr('Pages à reprendre : {p}', {'p': ((n.payload['pages'] as List?) ?? const []).join(', ')}),
        'review_ayat' => tr('{n} ayat à revoir', {'n': n.payload['count'] ?? 0}),
        'certificate' => tr('Nouveau certificat : {t}', {'t': n.payload['title'] ?? ''}),
        'reward' => n.payload['rewardKind'] == 'gift' ? tr('Cadeau remis : {t}', {'t': n.payload['title'] ?? ''}) : tr('Encouragement : {t}', {'t': n.payload['title'] ?? ''}),
        _ => tr('Notification'),
      };

  /// Un toucher ouvre la première page à reprendre, dans le mushaf, avec les couleurs de l'enseignant.
  void _open(AppNotification n) {
    final store = context.read<ValidationStore>();
    if (!n.read) store.markRead([n.id]);
    if (n.kind == 'certificate' || n.kind == 'reward') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => ResultsScreen(initialTab: n.kind == 'certificate' ? 1 : 2)));
      return;
    }
    final pages = ((n.payload['pages'] as List?) ?? const []).cast<num>();
    if (n.kind != 'retake_pages' || pages.isEmpty) return;
    final start = context.read<QuranRepository>().mushafPages[pages.first.toInt() - 1];
    final settings = context.read<Settings>();
    settings.readingMode = ReadingMode.mushaf;
    settings.setColoringIn(ReadingMode.mushaf, AyahColoring.validation);
    Navigator.push(context, MaterialPageRoute(builder: (_) => ReaderScreen(surah: start.$1, initialAyah: start.$2)));
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<ValidationStore>();
    final list = store.notifications;
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Notifications')),
        actions: [
          if (store.unread > 0) TextButton(onPressed: () => store.markRead(), child: Text(tr('Tout marquer comme lu'))),
        ],
      ),
      body: SafeArea(
        child: Constrained(
          child: Column(children: [
            const _PushBanner(),
            Expanded(child: RefreshIndicator(
            onRefresh: store.refresh,
            child: list.isEmpty
                ? ListView(children: [
                    SizedBox(
                      height: 360,
                      child: EmptyState(
                        icon: Icons.notifications_none,
                        title: tr('Aucune notification'),
                        body: tr('Vous serez prévenu ici quand votre enseignant signale une page à reprendre ou des ayat à revoir.'),
                      ),
                    ),
                  ])
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final n = list[i];
                      final icon = switch (n.kind) { 'retake_pages' => Icons.replay, 'certificate' => Icons.workspace_premium_outlined, 'reward' => Icons.favorite_outline, _ => Icons.rate_review_outlined };
                      return Card(
                        color: n.read ? null : context.colors.primary.withValues(alpha: 0.06),
                        child: ListTile(
                          leading: Icon(icon, color: n.read ? context.tones.muted : context.tones.red),
                          title: Text(_title(n), style: TextStyle(fontWeight: n.read ? FontWeight.w400 : FontWeight.w600)),
                          subtitle: Text('${n.payload['organizationName'] ?? ''} · ${since(n.createdAt)}'),
                          trailing: n.kind == 'review_ayat' ? null : const Icon(Icons.chevron_right),
                          onTap: () => _open(n),
                        ),
                      );
                    },
                  ),
          )),
        ]),
        ),
      ),
    );
  }
}

/// Alertes sur cet appareil quand l'app est fermée (version web / PWA ; sur iPhone, l'app doit être sur l'écran d'accueil).
class _PushBanner extends StatefulWidget {
  const _PushBanner();

  @override
  State<_PushBanner> createState() => _PushBannerState();
}

class _PushBannerState extends State<_PushBanner> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<PushService>().refresh());
  }

  Future<void> _toggle(PushService push, bool on) async {
    setState(() => _busy = true);
    try {
      if (on) {
        await push.enable();
      } else {
        await push.disable();
      }
    } catch (_) {
      if (mounted) snack(context, tr('Impossible de modifier les alertes pour le moment.'));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final push = context.watch<PushService>();
    if (push.state == PushState.unsupported || push.state == PushState.unavailable) return const SizedBox.shrink();
    final denied = push.state == PushState.denied;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Card(
        child: SwitchListTile(
          secondary: Icon(Icons.notifications_active_outlined, color: context.colors.primary),
          title: Text(tr('Alertes quand l’app est fermée')),
          subtitle: Text(denied
              ? (push.native
                  ? tr('Refusées sur ce téléphone : autorisez les notifications de l’app dans les réglages Android.')
                  : tr('Refusées dans le navigateur : autorisez les notifications dans ses réglages.'))
              : tr('Recevez un message sur cet appareil quand votre enseignant valide ou envoie un certificat.')),
          value: push.state == PushState.on,
          onChanged: _busy || denied ? null : (v) => _toggle(push, v),
        ),
      ),
    );
  }
}

