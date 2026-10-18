import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/quran_repository.dart';
import '../core/settings.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'reader_screen.dart';

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
        _ => tr('Notification'),
      };

  /// Un toucher ouvre la première page à reprendre, dans le mushaf, avec les couleurs de l'enseignant.
  void _open(AppNotification n) {
    final store = context.read<ValidationStore>();
    if (!n.read) store.markRead([n.id]);
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
          child: RefreshIndicator(
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
                      final retake = n.kind == 'retake_pages';
                      return Card(
                        color: n.read ? null : context.colors.primary.withValues(alpha: 0.06),
                        child: ListTile(
                          leading: Icon(retake ? Icons.replay : Icons.rate_review_outlined, color: n.read ? context.tones.muted : context.tones.red),
                          title: Text(_title(n), style: TextStyle(fontWeight: n.read ? FontWeight.w400 : FontWeight.w600)),
                          subtitle: Text('${n.payload['organizationName'] ?? ''} · ${since(n.createdAt)}'),
                          trailing: retake ? const Icon(Icons.chevron_right) : null,
                          onTap: () => _open(n),
                        ),
                      );
                    },
                  ),
          ),
        ),
      ),
    );
  }
}
