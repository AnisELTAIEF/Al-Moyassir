import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/admin_service.dart';
import '../core/auth_service.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/common.dart';
import 'admin/groups_tab.dart';
import 'admin/invitations_tab.dart';
import 'admin/users_tab.dart';
import 'group_members_screen.dart';
import '../core/i18n.dart';

/// Onglet « Suivi » : administration complète pour les admins globaux, gestion de leurs groupes pour les admins de groupe.
class SupervisionScreen extends StatelessWidget {
  const SupervisionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    if (!auth.signedIn || auth.api == null) return const SizedBox.shrink();
    final admin = AdminService(auth.api!);
    if (!auth.isAdmin) return _ManagerHome(admin: admin, auth: auth);
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Suivi et administration')),
          bottom: TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: [
            Tab(text: tr('Aperçu')),
            Tab(text: tr('Utilisateurs')),
            Tab(text: tr('Invitations')),
            Tab(text: tr('Groupes')),
          ]),
        ),
        body: TabBarView(children: [
          _Overview(admin: admin),
          UsersTab(admin: admin),
          InvitationsTab(admin: admin),
          GroupsTab(admin: admin),
        ]),
      ),
    );
  }
}

class _Overview extends StatelessWidget {
  const _Overview({required this.admin});
  final AdminService admin;

  @override
  Widget build(BuildContext context) {
    return AsyncView(
      load: admin.stats,
      builder: (context, s, _) {
        Widget tile(String label, String value, IconData icon, {String? sub}) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(icon, color: context.colors.primary),
                  const SizedBox(height: 10),
                  Text(value, style: context.text.headlineMedium),
                  Text(label, style: TextStyle(color: context.tones.muted)),
                  if (sub != null) Text(sub, style: TextStyle(fontSize: 12, color: context.tones.muted)),
                ]),
              ),
            );
        return Constrained(
          child: GridView.extent(
            padding: const EdgeInsets.all(16),
            maxCrossAxisExtent: 280,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.45,
            children: [
              tile(tr('utilisateurs'), '${s.users}', Icons.people_outline, sub: tr('{n} admin(s)', {'n': s.admins})),
              tile(tr('actifs sur 7 jours'), '${s.active7Days}', Icons.bolt_outlined),
              tile(tr('ayat appris au total'), '${s.memorizedTotal}', Icons.auto_stories_outlined,
                  sub: tr('soit {n} khatma(s)', {'n': (s.memorizedTotal / QuranRepository.totalAyahs).toStringAsFixed(1).replaceAll('.', ',')})),
              tile(tr('invitations en attente'), '${s.pendingInvitations}', Icons.mark_email_unread_outlined),
              tile(tr('groupes'), '${s.groups}', Icons.groups_outlined),
            ],
          ),
        );
      },
    );
  }
}

class _ManagerHome extends StatelessWidget {
  const _ManagerHome({required this.admin, required this.auth});
  final AdminService admin;
  final AuthService auth;

  @override
  Widget build(BuildContext context) {
    final groups = auth.groups.where((g) => g.isGroupAdmin).toList();
    return Scaffold(
      appBar: AppBar(title: Text(tr('Mes groupes'))),
      body: groups.isEmpty
          ? EmptyState(icon: Icons.groups_outlined, title: tr('Aucun groupe à suivre'))
          : Constrained(
              child: ListView(padding: const EdgeInsets.all(16), children: [
                for (final g in groups)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      child: ListTile(
                        leading: const Icon(Icons.groups),
                        title: Text(g.name),
                        subtitle: Text(tr('{n} membres · vous êtes admin du groupe', {'n': g.members})),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.push(context, MaterialPageRoute(
                            builder: (_) => GroupMembersScreen(admin: admin, groupId: g.id, groupName: g.name, isGlobalAdmin: false, meId: auth.userId))).then((_) => auth.loadGroups()),
                      ),
                    ),
                  ),
              ]),
            ),
    );
  }
}
