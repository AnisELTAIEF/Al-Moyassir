import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_service.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// « Mes établissements » : les associations / mosquées où j'ai un rôle, et le rattachement du compte
/// d'un enfant à sa fiche avec le code remis par l'administration.
class MyOrgsScreen extends StatefulWidget {
  const MyOrgsScreen({super.key});

  @override
  State<MyOrgsScreen> createState() => _MyOrgsScreenState();
}

class _MyOrgsScreenState extends State<MyOrgsScreen> {
  late Future<List<MyOrg>> _orgs = context.read<AuthService>().myOrgs();
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  String _role(String r) => switch (r) {
        'admin' => tr('Administratif'),
        'teacher' => tr('Enseignant'),
        _ => tr('Élève'),
      };

  Future<void> _link() async {
    final code = _code.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final name = await context.read<AuthService>().linkStudent(code);
      if (!mounted) return;
      _code.clear();
      snack(context, tr('Compte rattaché à {org}.', {'org': name}));
      setState(() => _orgs = context.read<AuthService>().myOrgs());
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('Mes établissements'))),
      body: SafeArea(
        child: Constrained(
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
            FutureBuilder<List<MyOrg>>(
              future: _orgs,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
                }
                if (snap.hasError) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(snap.error is ApiException ? (snap.error as ApiException).message : tr('Chargement impossible. Réessayez.'),
                        style: TextStyle(color: context.colors.error)),
                  );
                }
                final orgs = snap.data!;
                if (orgs.isEmpty) {
                  return EmptyState(
                    icon: Icons.apartment_outlined,
                    title: tr('Aucun établissement'),
                    body: tr('Si votre enfant est inscrit dans une association ou une mosquée, saisissez ci-dessous le code remis par l’administration.'),
                  );
                }
                return Column(children: [
                  for (final o in orgs)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: ListTile(
                          leading: Icon(o.isMosque ? Icons.mosque_outlined : Icons.apartment_outlined, color: context.colors.primary),
                          title: Text(o.name),
                          subtitle: Text(o.roles.map(_role).join(' · ')),
                        ),
                      ),
                    ),
                ]);
              },
            ),
            SectionTitle(tr('Rattacher le compte d’un élève')),
            Text(tr('Saisissez le code remis par l’administration pour relier ce compte à la fiche de l’élève.'),
                style: TextStyle(color: context.tones.muted)),
            const SizedBox(height: 12),
            TextField(
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(labelText: tr('Code de liaison'), hintText: 'K7XQ-M2PA'),
              onSubmitted: (_) => _link(),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _busy ? null : _link,
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.link),
              label: Text(tr('Rattacher')),
            ),
          ]),
        ),
      ),
    );
  }
}
