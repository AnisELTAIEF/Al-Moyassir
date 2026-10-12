import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_service.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../core/i18n.dart';

/// Connexion (Google ou e-mail) et entrée par code d'invitation.
class LoginPanel extends StatefulWidget {
  const LoginPanel({super.key});
  @override
  State<LoginPanel> createState() => _LoginPanelState();
}

class _LoginPanelState extends State<LoginPanel> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthService>();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(tr('Connexion'), style: context.text.headlineSmall),
      const SizedBox(height: 6),
      Text(tr('L’accès se fait sur invitation. Utilisez l’adresse à laquelle vous avez été invité(e).'),
          style: TextStyle(color: context.tones.muted)),
      const SizedBox(height: 20),
      if (auth.googleEnabled) ...[
        FilledButton.icon(
          onPressed: _busy ? null : () => _run(() async => auth.signInWithGoogle()),
          icon: const _GoogleMark(),
          label: Text(tr('Continuer avec Google')),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(children: [
            const Expanded(child: Divider()),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text(tr('ou'), style: TextStyle(color: context.tones.muted))),
            const Expanded(child: Divider()),
          ]),
        ),
      ],
      TextField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        decoration: InputDecoration(labelText: tr('E-mail')),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _password,
        obscureText: true,
        autofillHints: const [AutofillHints.password],
        decoration: InputDecoration(labelText: tr('Mot de passe')),
        onSubmitted: (_) => _run(() => auth.signInWithPassword(_email.text.trim(), _password.text)),
      ),
      const SizedBox(height: 12),
      OutlinedButton(
        onPressed: _busy ? null : () => _run(() => auth.signInWithPassword(_email.text.trim(), _password.text)),
        child: Text(tr('Se connecter avec l’e-mail')),
      ),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: context.colors.error))),
      const SizedBox(height: 8),
      TextButton.icon(
        onPressed: _busy ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => const InvitationScreen())),
        icon: const Icon(Icons.mark_email_unread_outlined),
        label: Text(tr('Créer un compte (code d’invitation)')),
      ),
    ]);
  }
}

class _GoogleMark extends StatelessWidget {
  const _GoogleMark();
  @override
  Widget build(BuildContext context) => Container(
        width: 22,
        height: 22,
        alignment: Alignment.center,
        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
        child: const Text('G', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF4285F4), fontSize: 14)),
      );
}

/// Code d'invitation → aperçu → Google ou création d'un mot de passe.
class InvitationScreen extends StatefulWidget {
  const InvitationScreen({super.key});
  @override
  State<InvitationScreen> createState() => _InvitationScreenState();
}

class _InvitationScreenState extends State<InvitationScreen> {
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  Map<String, dynamic>? _invite;
  bool _noCode = false; // inscription sans code : réservée à l'adresse administrateur du serveur
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_code, _name, _email, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _done() {
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    snack(context, tr('Bienvenue ! Votre compte est prêt.'));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthService>();
    final inv = _invite;
    return Scaffold(
      appBar: AppBar(title: Text(tr('Créer un compte'))),
      body: Constrained(
        maxWidth: 520,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          if (inv == null && !_noCode) ...[
            Text(tr('Saisissez le code reçu'), style: context.text.headlineSmall),
            const SizedBox(height: 6),
            Text(tr('Il ressemble à K7XQ-M2PA.'), style: TextStyle(color: context.tones.muted)),
            const SizedBox(height: 16),
            TextField(
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              style: const TextStyle(fontSize: 24, letterSpacing: 3, fontWeight: FontWeight.w600),
              decoration: const InputDecoration(hintText: 'XXXX-XXXX'),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () => _run(() async {
                        final r = await auth.previewInvitation(_code.text);
                        setState(() {
                          _invite = r;
                          _email.text = r['email'] as String;
                        });
                      }),
              child: Text(tr('Vérifier le code')),
            ),
            const SizedBox(height: 24),
            Text(tr('Pas de code ? Demandez-en un à l’admin de votre groupe : il le crée depuis l’onglet Suivi ou l’admin web.'),
                style: TextStyle(color: context.tones.muted)),
            TextButton(
              onPressed: _busy ? null : () => setState(() => _noCode = true),
              child: Text(tr('Je suis l’administrateur principal (sans code)')),
            ),
          ] else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: inv == null
                    ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(tr('Compte administrateur'), style: context.text.titleLarge),
                        const SizedBox(height: 6),
                        Text(tr('Réservé à l’adresse administrateur configurée sur le serveur. Les autres personnes ont besoin d’un code d’invitation.'),
                            style: TextStyle(color: context.tones.muted)),
                      ])
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(tr('Invitation valide'), style: context.text.titleLarge),
                        const SizedBox(height: 6),
                        Text(tr('Pour : {email}', {'email': inv['email']})),
                        if (inv['groupName'] != null) Text(tr('Groupe : {g}', {'g': inv['groupName']})),
                        if (inv['invitedBy'] != null) Text(tr('De la part de : {name}', {'name': inv['invitedBy']})),
                        if (inv['role'] == 'admin') Text(tr('Rôle : administrateur'), style: TextStyle(color: context.colors.primary)),
                      ]),
              ),
            ),
            const SizedBox(height: 20),
            if (auth.googleEnabled) ...[
              FilledButton.icon(
                onPressed: _busy ? null : () => _run(() async {
                      if (await auth.signInWithGoogle(invitationCode: _noCode ? null : _code.text)) _done();
                    }),
                icon: const Icon(Icons.login),
                label: Text(tr('Continuer avec Google')),
              ),
              const SizedBox(height: 20),
              Text(tr('Ou créez un mot de passe'), style: context.text.titleMedium),
              const SizedBox(height: 10),
            ],
            TextField(controller: _name, decoration: InputDecoration(labelText: tr('Votre nom (visible par votre groupe)'))),
            const SizedBox(height: 10),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: tr('E-mail'))),
            const SizedBox(height: 10),
            TextField(controller: _password, obscureText: true, decoration: InputDecoration(labelText: tr('Mot de passe (8 caractères minimum)'))),
            const SizedBox(height: 14),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () {
                      if (_name.text.trim().length < 2) return setState(() => _error = tr('Indiquez votre nom.'));
                      if (_password.text.length < 8) return setState(() => _error = tr('Le mot de passe doit faire au moins 8 caractères.'));
                      _run(() async {
                        await auth.register(email: _email.text.trim(), password: _password.text, displayName: _name.text.trim(), invitationCode: _noCode ? null : _code.text);
                        _done();
                      });
                    },
              child: Text(tr('Créer mon compte')),
            ),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: TextStyle(color: context.colors.error))),
        ]),
      ),
    );
  }
}
