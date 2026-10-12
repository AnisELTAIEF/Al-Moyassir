import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_service.dart';
import '../../core/api_client.dart';
import '../../core/auth_service.dart';
import '../../core/models.dart';
import '../../theme.dart';
import '../../widgets/async_view.dart';
import '../../widgets/common.dart';
import '../progress_detail_screen.dart';
import '../../core/i18n.dart';

class UsersTab extends StatefulWidget {
  const UsersTab({super.key, required this.admin});
  final AdminService admin;
  @override
  State<UsersTab> createState() => _UsersTabState();
}

class _UsersTabState extends State<UsersTab> with AutomaticKeepAliveClientMixin {
  String _q = '';
  Key _key = UniqueKey();

  @override
  bool get wantKeepAlive => true;

  void _refresh() => setState(() => _key = UniqueKey());

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final meId = context.read<AuthService>().userId;
    return AsyncView<List<UserStats>>(
      key: _key,
      load: widget.admin.users,
      builder: (context, users, _) {
        final q = _q.toLowerCase();
        final list = users.where((u) => q.isEmpty || u.name.toLowerCase().contains(q) || u.email.contains(q)).toList()
          ..sort((a, b) => b.memorized.compareTo(a.memorized));
        final best = users.map((u) => u.memorized).fold<int>(1, (a, b) => b > a ? b : a);
        return Constrained(
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            TextField(
              decoration: InputDecoration(prefixIcon: Icon(Icons.search), hintText: tr('Rechercher un nom ou un e-mail'), isDense: true),
              onChanged: (v) => setState(() => _q = v),
            ),
            const SizedBox(height: 12),
            for (final u in list)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => _actions(u, isMe: u.id == meId),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      CircleAvatar(
                        backgroundColor: u.active ? context.colors.primary.withValues(alpha: 0.15) : context.tones.line,
                        child: Text(u.name.characters.first.toUpperCase()),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Flexible(child: Text(u.name, style: context.text.titleMedium, overflow: TextOverflow.ellipsis)),
                            if (u.isAdmin) _tag(context, tr('Admin'), context.tones.gold),
                            if (!u.active) _tag(context, tr('Désactivé'), context.tones.red),
                          ]),
                          Text(u.email, style: TextStyle(fontSize: 12.5, color: context.tones.muted), overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 6),
                          ThinBar(value: u.memorized / best, height: 4),
                          const SizedBox(height: 4),
                          Text(tr('{m} appris · {l} en cours · actif {t}', {'m': u.memorized, 'l': u.learning, 't': since(u.lastActivity)}),
                              style: TextStyle(fontSize: 12, color: context.tones.muted)),
                        ]),
                      ),
                    ]),
                  ),
                ),
              ),
          ]),
        );
      },
    );
  }

  Widget _tag(BuildContext context, String text, Color color) => Container(
        margin: const EdgeInsets.only(left: 8),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
      );

  Future<void> _act(Future<void> Function() f, String done) async {
    try {
      await f();
      if (mounted) snack(context, done);
      _refresh();
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    }
  }

  Future<void> _actions(UserStats u, {required bool isMe}) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(u.name, style: c.text.titleLarge), subtitle: Text(u.email)),
          const Divider(),
          ListTile(leading: const Icon(Icons.insights), title: Text(tr('Voir la progression')), onTap: () => Navigator.pop(c, 'progress')),
          ListTile(
            leading: Icon(u.isAdmin ? Icons.person_outline : Icons.admin_panel_settings_outlined),
            title: Text(u.isAdmin ? tr('Rôle : passer en utilisateur') : tr('Rôle : passer administrateur')),
            onTap: () => Navigator.pop(c, 'role'),
          ),
          if (!isMe)
            ListTile(
              leading: Icon(u.active ? Icons.block : Icons.check_circle_outline),
              title: Text(u.active ? tr('Désactiver le compte') : tr('Réactiver le compte')),
              onTap: () => Navigator.pop(c, 'status'),
            ),
          if (!isMe)
            ListTile(
              leading: Icon(Icons.delete_outline, color: c.colors.error),
              title: Text(tr('Supprimer le compte et sa progression'), style: TextStyle(color: c.colors.error)),
              onTap: () => Navigator.pop(c, 'delete'),
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (!mounted || choice == null) return;
    switch (choice) {
      case 'progress':
        Navigator.push(context, MaterialPageRoute(builder: (_) => ProgressDetailScreen(title: u.name, load: () => widget.admin.userProgress(u.id))));
      case 'role':
        final toAdmin = !u.isAdmin;
        if (await confirm(context,
            title: toAdmin ? tr('Nommer {name} administrateur ?', {'name': u.name}) : tr('Retirer le rôle administrateur ?'),
            body: toAdmin ? tr('Il pourra gérer les utilisateurs, les invitations et voir toutes les progressions.') : tr('{name} redeviendra un utilisateur simple.', {'name': u.name}))) {
          await _act(() => widget.admin.updateUser(u.id, role: toAdmin ? 'admin' : 'user'), toAdmin ? tr('{name} est administrateur', {'name': u.name}) : tr('{name} est utilisateur', {'name': u.name}));
          if (isMe && mounted) await context.read<AuthService>().refreshProfile();
        }
      case 'status':
        if (await confirm(context,
            title: u.active ? tr('Désactiver {name} ?', {'name': u.name}) : tr('Réactiver {name} ?', {'name': u.name}),
            body: u.active ? tr('Il sera déconnecté de tous ses appareils. Sa progression est conservée.') : tr('Il pourra de nouveau se connecter.'),
            danger: u.active)) {
          await _act(() => widget.admin.updateUser(u.id, status: u.active ? 'disabled' : 'active'), u.active ? tr('Compte désactivé') : tr('Compte réactivé'));
        }
      case 'delete':
        if (await confirm(context, title: tr('Supprimer {name} ?', {'name': u.name}), body: tr('Le compte et toute sa progression seront effacés définitivement.'), ok: tr('Supprimer'), danger: true)) {
          await _act(() => widget.admin.deleteUser(u.id), tr('Compte supprimé'));
        }
    }
  }
}
