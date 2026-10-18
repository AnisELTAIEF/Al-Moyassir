import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/auth_service.dart';
import '../core/i18n.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Résultats d'examens et de concours, certificats (historique complet) et encouragements de l'élève.
/// Un cadeau n'apparaît qu'une fois remis : l'équipe garde la surprise.
class ResultsScreen extends StatefulWidget {
  const ResultsScreen({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  late Future<List<Map<String, dynamic>>> _data = _load();

  Future<List<Map<String, dynamic>>> _load() async {
    final r = await context.read<AuthService>().api!.get('/me/results') as Map<String, dynamic>;
    return [for (final o in (r['organizations'] as List)) o as Map<String, dynamic>];
  }

  String _day(String? d) => d == null ? '' : fmtDate(DateTime.parse(d));

  Future<void> _open(String id) async {
    try {
      final r = await context.read<AuthService>().api!.get('/me/certificates/$id/link') as Map<String, dynamic>;
      await launchUrl(Uri.parse(r['url'] as String), mode: LaunchMode.externalApplication);
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    }
  }

  /// Une section par établissement ; titre d'établissement seulement s'il y en a plusieurs.
  Widget _list(List<Map<String, dynamic>> orgs, String key, String empty, Widget Function(Map<String, dynamic>) tile) {
    final many = orgs.length > 1;
    final children = <Widget>[];
    for (final o in orgs) {
      final items = [for (final i in (o[key] as List)) i as Map<String, dynamic>];
      if (many && items.isNotEmpty) children.add(SectionTitle(o['organizationName'] as String));
      for (final i in items) {
        children.add(Padding(padding: const EdgeInsets.only(bottom: 8), child: Card(child: tile(i))));
      }
    }
    if (children.isEmpty) return EmptyState(icon: Icons.inbox_outlined, title: empty);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: children);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      initialIndex: widget.initialTab.clamp(0, 2),
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Résultats et certificats')),
          bottom: TabBar(tabs: [Tab(text: tr('Résultats')), Tab(text: tr('Certificats')), Tab(text: tr('Encouragements'))]),
        ),
        body: SafeArea(
          child: Constrained(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _data,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snap.hasError) {
                  final e = snap.error;
                  return EmptyState(
                    icon: Icons.error_outline,
                    title: e is ApiException ? e.message : tr('Chargement impossible. Réessayez.'),
                    action: FilledButton(onPressed: () => setState(() => _data = _load()), child: Text(tr('Réessayer'))),
                  );
                }
                final orgs = snap.data!;
                return TabBarView(children: [
                  _list(orgs, 'assessments', tr('Aucun résultat pour l’instant.'), (a) {
                    final extra = [if (a['score'] != null) '${a['score']}', if (a['rank'] != null) tr('Rang {r}', {'r': a['rank']})].join(' · ');
                    return ListTile(
                      leading: Icon(a['kind'] == 'competition' ? Icons.emoji_events_outlined : Icons.school_outlined, color: context.colors.primary),
                      title: Text(a['title'] as String),
                      subtitle: Text([a['kind'] == 'competition' ? tr('Concours') : tr('Examen'), _day(a['heldOn'] as String?), if (extra.isNotEmpty) extra].join(' · ')),
                    );
                  }),
                  _list(orgs, 'certificates', tr('Aucun certificat pour l’instant.'), (c) => ListTile(
                        leading: Icon(Icons.workspace_premium_outlined, color: context.tones.gold),
                        title: Text(c['title'] as String),
                        subtitle: Text(_day(c['issuedOn'] as String?)),
                        trailing: const Icon(Icons.open_in_new),
                        onTap: () => _open(c['id'] as String),
                      )),
                  _list(orgs, 'rewards', tr('Aucun encouragement pour l’instant.'), (r) => ListTile(
                        leading: Icon(r['kind'] == 'gift' ? Icons.card_giftcard : Icons.favorite_outline, color: context.tones.red),
                        title: Text(r['title'] as String),
                        subtitle: (r['body'] as String).isEmpty ? null : Text(r['body'] as String),
                      )),
                ]);
              },
            ),
          ),
        ),
      ),
    );
  }
}
