import 'package:flutter/material.dart';

import '../core/admin_service.dart';
import '../core/api_client.dart';
import '../core/models.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/common.dart';
import '../widgets/invitation_sheet.dart';
import 'progress_detail_screen.dart';
import '../core/i18n.dart';

/// Un groupe : membres et progression, ajout par e-mail, admins du groupe, invitations en attente.
/// Accessible aux admins globaux et aux admins de ce groupe.
class GroupMembersScreen extends StatefulWidget {
  const GroupMembersScreen({super.key, required this.admin, required this.groupId, required this.groupName, required this.isGlobalAdmin, this.meId});
  final AdminService admin;
  final String groupId;
  final String groupName;
  final bool isGlobalAdmin;
  final String? meId;
  @override
  State<GroupMembersScreen> createState() => _GroupMembersScreenState();
}

class _GroupMembersScreenState extends State<GroupMembersScreen> {
  Key _key = UniqueKey();
  late String _name = widget.groupName;
  void _refresh() => setState(() => _key = UniqueKey());

  Future<void> _act(Future<void> Function() f, String done) async {
    try {
      await f();
      if (mounted) snack(context, done);
      _refresh();
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_name),
        actions: [IconButton(tooltip: tr('Renommer le groupe'), onPressed: _rename, icon: const Icon(Icons.edit_outlined))],
      ),
      floatingActionButton: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.person_add_alt), label: Text(tr('Ajouter'))),
      body: AsyncView<(List<UserStats>, List<Invitation>)>(
        key: _key,
        load: () async => (await widget.admin.groupMembers(widget.groupId), await widget.admin.groupInvitations(widget.groupId)),
        builder: (context, data, _) {
          final (members, invitations) = data;
          final best = members.map((m) => m.memorized).fold<int>(1, (a, b) => b > a ? b : a);
          final total = members.fold<int>(0, (a, m) => a + m.memorized);
          final admins = members.where((m) => m.groupRole == 'admin').length;
          return Constrained(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
              if (members.isEmpty)
                EmptyState(icon: Icons.group_add_outlined, title: tr('Aucun membre'), body: tr('Touchez « Ajouter » et saisissez l’e-mail d’une personne. Si elle n’a pas encore de compte, un code d’invitation est créé.'))
              else
                Text(
                  tr('{n} membres · {a} admin(s) du groupe · moyenne {p} du Coran', {'n': members.length, 'a': admins, 'p': pct(total / members.length, QuranRepository.totalAyahs)}),
                  style: TextStyle(color: context.tones.muted),
                ),
              const SizedBox(height: 12),
              for (final m in members) _memberCard(m, best, admins),
              if (invitations.isNotEmpty) ...[
                SectionTitle(tr('Invitations en attente')),
                for (final i in invitations)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: Icon(Icons.schedule, color: context.tones.gold),
                      title: Text(i.email),
                      subtitle: Text(tr('{role} · expire le {d}', {'role': i.groupRole == 'admin' ? tr('Admin du groupe') : tr('Membre'), 'd': fmtDate(i.expiresAt)})),
                      trailing: IconButton(
                        tooltip: tr('Révoquer'),
                        icon: const Icon(Icons.block),
                        onPressed: () => _act(() => widget.admin.revokeGroupInvitation(widget.groupId, i.id), tr('Invitation révoquée')),
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 8),
              Text(tr('Les admins du groupe gèrent ses membres et voient leur progression. Ils n’ont pas accès aux autres groupes.'),
                  style: TextStyle(fontSize: 12, color: context.tones.muted)),
            ]),
          );
        },
      ),
    );
  }

  Widget _memberCard(UserStats m, int best, int admins) {
    final isAdmin = m.groupRole == 'admin';
    final inactive = m.lastActivity == null || DateTime.now().difference(m.lastActivity!).inDays >= 7;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.push(context, MaterialPageRoute(
          builder: (_) => ProgressDetailScreen(title: m.name, load: () => widget.admin.memberProgress(widget.groupId, m.id)),
        )),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(m.name, style: context.text.titleMedium, overflow: TextOverflow.ellipsis)),
                  if (isAdmin) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: context.tones.gold.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(20)),
                      child: Text(tr('admin'), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ]),
                const SizedBox(height: 6),
                ThinBar(value: m.memorized / best),
                const SizedBox(height: 6),
                Text(tr('{m} appris · {l} en cours · actif {t}', {'m': m.memorized, 'l': m.learning, 't': since(m.lastActivity)}),
                    style: TextStyle(fontSize: 12.5, color: inactive ? context.tones.red : context.tones.muted)),
              ]),
            ),
            PopupMenuButton<String>(
              tooltip: tr('Actions'),
              onSelected: (v) async {
                switch (v) {
                  case 'admin':
                    await _act(() => widget.admin.setGroupRole(widget.groupId, m.id, 'admin'), tr('{name} est admin du groupe', {'name': m.name}));
                  case 'member':
                    await _act(() => widget.admin.setGroupRole(widget.groupId, m.id, 'member'), tr('{name} n’est plus admin du groupe', {'name': m.name}));
                  case 'remove':
                    if (await confirm(context, title: tr('Retirer {name} du groupe ?', {'name': m.name}), body: tr('Son compte et sa progression sont conservés.'), ok: tr('Retirer'), danger: true)) {
                      await _act(() => widget.admin.removeMember(widget.groupId, m.id), tr('{name} retiré du groupe', {'name': m.name}));
                    }
                }
              },
              itemBuilder: (_) => [
                if (!isAdmin) PopupMenuItem(value: 'admin', child: Text(tr('Nommer admin du groupe'))),
                if (isAdmin) PopupMenuItem(value: 'member', child: Text(tr('Retirer le rôle d’admin'))),
                PopupMenuItem(value: 'remove', child: Text(m.id == widget.meId ? tr('Quitter le groupe') : tr('Retirer du groupe'))),
              ],
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _rename() async {
    final c = TextEditingController(text: _name);
    final name = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(tr('Renommer le groupe')),
        content: TextField(controller: c, autofocus: true, decoration: InputDecoration(labelText: tr('Nom du groupe'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(tr('Annuler'))),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: Text(tr('Enregistrer'))),
        ],
      ),
    );
    if (name == null || name.length < 2) return;
    await _act(() async {
      await widget.admin.renameGroup(widget.groupId, name);
      setState(() => _name = name);
    }, tr('Groupe renommé'));
  }

  /// Ajout par e-mail (compte existant → ajouté ; sinon → invitation à partager).
  Future<void> _add() async {
    final email = TextEditingController();
    var role = 'member';
    String? error;
    final result = await showModalBottomSheet<AddMemberResult>(
      context: context,
      isScrollControlled: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: EdgeInsets.fromLTRB(24, 0, 24, 24 + MediaQuery.viewInsetsOf(c).bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(tr('Ajouter au groupe'), style: c.text.titleLarge),
            const SizedBox(height: 4),
            Text(tr('Si la personne n’a pas encore de compte, un code d’invitation sera créé pour ce groupe.'),
                style: TextStyle(color: c.tones.muted)),
            const SizedBox(height: 16),
            TextField(controller: email, autofocus: true, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: tr('E-mail'))),
            SizedBox(height: 12),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 'member', label: Text(tr('Membre'))),
                ButtonSegment(value: 'admin', label: Text(tr('Admin du groupe'))),
              ],
              selected: {role},
              onSelectionChanged: (s) => set(() => role = s.first),
            ),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(error!, style: TextStyle(color: c.colors.error))),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                try {
                  final r = await widget.admin.addMemberByEmail(widget.groupId, email.text.trim(), role);
                  if (c.mounted) Navigator.pop(c, r);
                } on ApiException catch (e) {
                  set(() => error = e.message);
                }
              },
              child: Text(tr('Ajouter')),
            ),
            if (widget.isGlobalAdmin) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  Navigator.pop(c);
                  _pickUsers();
                },
                child: Text(tr('Choisir parmi les utilisateurs existants')),
              ),
            ],
          ]),
        ),
      ),
    );
    if (result == null || !mounted) return;
    _refresh();
    if (result.added) {
      snack(context, tr('{email} ajouté(e) au groupe', {'email': result.email}));
    } else if (result.code != null) {
      await showInvitationSheet(context, email: result.email, code: result.code!, message: result.message ?? result.code!);
    }
  }

  /// Admins globaux : ajout en lot depuis la liste des utilisateurs.
  Future<void> _pickUsers() async {
    List<UserStats> users;
    List<UserStats> current;
    try {
      users = await widget.admin.users();
      current = await widget.admin.groupMembers(widget.groupId);
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
      return;
    }
    final already = current.map((m) => m.id).toSet();
    final candidates = users.where((u) => !already.contains(u.id) && u.active).toList();
    if (!mounted) return;
    if (candidates.isEmpty) {
      snack(context, tr('Tous les utilisateurs sont déjà dans ce groupe.'));
      return;
    }
    final selected = <String>{};
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: Text(tr('Ajouter au groupe')),
          content: SizedBox(
            width: 400,
            child: ListView(shrinkWrap: true, children: [
              for (final u in candidates)
                CheckboxListTile(
                  value: selected.contains(u.id),
                  title: Text(u.name),
                  subtitle: Text(u.email),
                  onChanged: (v) => set(() => v == true ? selected.add(u.id) : selected.remove(u.id)),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('Annuler'))),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('Ajouter ({n})', {'n': selected.length}))),
          ],
        ),
      ),
    );
    if (ok != true || selected.isEmpty) return;
    await _act(() async {
      for (final id in selected) {
        await widget.admin.addUserToGroup(widget.groupId, id, 'member');
      }
    }, tr('{n} membre(s) ajouté(s)', {'n': selected.length}));
  }
}
