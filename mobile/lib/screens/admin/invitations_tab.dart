import 'package:flutter/material.dart';

import '../../core/admin_service.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../theme.dart';
import '../../widgets/async_view.dart';
import '../../widgets/common.dart';
import '../../widgets/invitation_sheet.dart';
import '../../core/i18n.dart';

class InvitationsTab extends StatefulWidget {
  const InvitationsTab({super.key, required this.admin});
  final AdminService admin;
  @override
  State<InvitationsTab> createState() => _InvitationsTabState();
}

class _InvitationsTabState extends State<InvitationsTab> with AutomaticKeepAliveClientMixin {
  Key _key = UniqueKey();
  @override
  bool get wantKeepAlive => true;
  void _refresh() => setState(() => _key = UniqueKey());

  static Map<String, String> get _states => {'pending': tr('En attente'), 'accepted': tr('Acceptée'), 'revoked': tr('Révoquée'), 'expired': tr('Expirée')};

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(onPressed: _create, icon: const Icon(Icons.person_add_alt_1), label: Text(tr('Inviter'))),
      body: AsyncView<List<Invitation>>(
        key: _key,
        load: widget.admin.invitations,
        builder: (context, items, _) {
          if (items.isEmpty) {
            return ListView(children: [
              SizedBox(height: 80),
              EmptyState(icon: Icons.mark_email_unread_outlined, title: tr('Aucune invitation'), body: tr('Touchez « Inviter » pour ajouter une personne. Elle recevra un code à saisir dans l’app.')),
            ]);
          }
          return Constrained(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
              for (final i in items)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: Icon(switch (i.state) {
                      'pending' => Icons.schedule,
                      'accepted' => Icons.check_circle,
                      _ => Icons.cancel_outlined,
                    }, color: i.state == 'accepted' ? context.colors.primary : i.state == 'pending' ? context.tones.gold : context.tones.muted),
                    title: Text(i.email),
                    subtitle: Text([
                      _states[i.state] ?? i.state,
                      if (i.role == 'admin') tr('admin global'),
                      if (i.groupName != null) i.groupRole == 'admin' ? tr('{g} (admin du groupe)', {'g': i.groupName}) : i.groupName!,
                      if (i.state == 'pending') tr('expire le {d}', {'d': fmtDate(i.expiresAt)}),
                    ].join(' · ')),
                    trailing: i.state == 'pending'
                        ? IconButton(
                            tooltip: tr('Révoquer'),
                            icon: const Icon(Icons.block),
                            onPressed: () async {
                              if (!await confirm(context, title: tr('Révoquer l’invitation ?'), body: tr('Le code de {email} ne fonctionnera plus.', {'email': i.email}), ok: tr('Révoquer'), danger: true)) return;
                              try {
                                await widget.admin.revokeInvitation(i.id);
                                _refresh();
                              } on ApiException catch (e) {
                                if (context.mounted) snack(context, e.message);
                              }
                            },
                          )
                        : null,
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }

  Future<void> _create() async {
    List<GroupSummary> groups = const [];
    try {
      groups = await widget.admin.groups();
    } catch (_) {}
    if (!mounted) return;
    final email = TextEditingController();
    var role = 'user';
    var groupRole = 'member';
    String? groupId;
    String? error;
    final created = await showDialog<CreatedInvitation>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: Text(tr('Inviter une personne')),
          content: SizedBox(
            width: 420,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TextField(controller: email, autofocus: true, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: tr('E-mail (Google de préférence)'))),
              SizedBox(height: 14),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'user', label: Text(tr('Utilisateur')), icon: Icon(Icons.person_outline)),
                  ButtonSegment(value: 'admin', label: Text(tr('Admin global')), icon: Icon(Icons.admin_panel_settings_outlined)),
                ],
                selected: {role},
                onSelectionChanged: (s) => set(() => role = s.first),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String?>(
                initialValue: groupId,
                decoration: InputDecoration(labelText: tr('Groupe (facultatif)')),
                items: [
                  DropdownMenuItem(value: null, child: Text(tr('Aucun'))),
                  for (final g in groups) DropdownMenuItem(value: g.id, child: Text(g.name)),
                ],
                onChanged: (v) => set(() => groupId = v),
              ),
              if (groupId != null) ...[
                const SizedBox(height: 10),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: groupRole == 'admin',
                  title: Text(tr('Admin de ce groupe')),
                  subtitle: Text(tr('Pourra gérer les membres du groupe')),
                  onChanged: (v) => set(() => groupRole = v ? 'admin' : 'member'),
                ),
              ],
              if (error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(error!, style: TextStyle(color: c.colors.error))),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: Text(tr('Annuler'))),
            FilledButton(
              onPressed: () async {
                try {
                  final r = await widget.admin.invite(email.text.trim(), role: role, groupId: groupId, groupRole: groupRole);
                  if (c.mounted) Navigator.pop(c, r);
                } on ApiException catch (e) {
                  set(() => error = e.message);
                }
              },
              child: Text(tr('Créer l’invitation')),
            ),
          ],
        ),
      ),
    );
    if (created == null || !mounted) return;
    _refresh();
    await showInvitationSheet(context, email: created.email, code: created.code, message: created.message);
  }
}
