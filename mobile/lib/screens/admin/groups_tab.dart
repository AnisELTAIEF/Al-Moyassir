import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../../core/admin_service.dart';
import '../../core/auth_service.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../theme.dart';
import '../../widgets/async_view.dart';
import '../../widgets/common.dart';
import '../group_members_screen.dart';
import '../../core/i18n.dart';

class GroupsTab extends StatefulWidget {
  const GroupsTab({super.key, required this.admin});
  final AdminService admin;
  @override
  State<GroupsTab> createState() => _GroupsTabState();
}

class _GroupsTabState extends State<GroupsTab> with AutomaticKeepAliveClientMixin {
  Key _key = UniqueKey();
  @override
  bool get wantKeepAlive => true;
  void _refresh() => setState(() => _key = UniqueKey());

  Future<String?> _askName(String title, [String initial = '']) {
    final c = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(title),
        content: TextField(controller: c, autofocus: true, decoration: InputDecoration(labelText: tr('Nom du groupe'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(tr('Annuler'))),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: Text(tr('Enregistrer'))),
        ],
      ),
    );
  }

  Future<void> _act(Future<void> Function() f) async {
    try {
      await f();
      _refresh();
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final name = await _askName(tr('Nouveau groupe'));
          if (name != null && name.length >= 2) await _act(() => widget.admin.createGroup(name));
        },
        icon: const Icon(Icons.add),
        label: Text(tr('Nouveau groupe')),
      ),
      body: AsyncView<List<GroupSummary>>(
        key: _key,
        load: widget.admin.groups,
        builder: (context, groups, _) {
          if (groups.isEmpty) {
            return ListView(children: [
              SizedBox(height: 80),
              EmptyState(icon: Icons.groups_outlined, title: tr('Aucun groupe'), body: tr('Créez une halaqa, une classe ou une famille pour suivre ses membres ensemble.')),
            ]);
          }
          return Constrained(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
              for (final g in groups)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: CircleAvatar(backgroundColor: context.colors.primary.withValues(alpha: 0.12), child: Icon(Icons.groups)),
                    title: Text(g.name),
                    subtitle: Text(g.managers > 0 ? tr('{n} membres · {a} admin(s) du groupe', {'n': g.members, 'a': g.managers}) : tr('{n} membres', {'n': g.members})),
                    onTap: () => Navigator.push(context, MaterialPageRoute(
                      builder: (_) => GroupMembersScreen(admin: widget.admin, groupId: g.id, groupName: g.name, isGlobalAdmin: true, meId: context.read<AuthService>().userId),
                    )).then((_) => _refresh()),
                    trailing: PopupMenuButton<String>(
                      onSelected: (v) async {
                        if (v == 'rename') {
                          final n = await _askName(tr('Renommer le groupe'), g.name);
                          if (n != null && n.length >= 2) await _act(() => widget.admin.renameGroup(g.id, n));
                        } else if (await confirm(context, title: tr('Supprimer « {name} » ?', {'name': g.name}), body: tr('Les membres et leur progression sont conservés ; seul le groupe disparaît.'), ok: tr('Supprimer'), danger: true)) {
                          await _act(() => widget.admin.deleteGroup(g.id));
                        }
                      },
                      itemBuilder: (_) => [
                        PopupMenuItem(value: 'rename', child: Text(tr('Renommer'))),
                        PopupMenuItem(value: 'delete', child: Text(tr('Supprimer'))),
                      ],
                    ),
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}
