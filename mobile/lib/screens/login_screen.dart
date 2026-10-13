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
      Text(tr('Première fois ? Créez votre compte avec le code reçu (invitation ou code du groupe).'),
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
      Align(
        alignment: AlignmentDirectional.centerEnd,
        child: TextButton(
          onPressed: _busy ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ResetPasswordScreen())),
          child: Text(tr('Mot de passe oublié ?')),
        ),
      ),
      const SizedBox(height: 4),
      TextButton.icon(
        onPressed: _busy ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => const InvitationScreen())),
        icon: const Icon(Icons.mark_email_unread_outlined),
        label: Text(tr('Créer un compte avec un code')),
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

/// Réinitialisation du mot de passe : l'admin fournit un code, la personne choisit un nouveau mot de passe.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});
  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit(AuthService auth) {
    if (_code.text.trim().length < 6) return setState(() => _error = tr('Indiquez le code reçu.'));
    if (_password.text.length < 8) return setState(() => _error = tr('Le mot de passe doit faire au moins 8 caractères.'));
    setState(() {
      _busy = true;
      _error = null;
    });
    () async {
      try {
        await auth.resetPassword(_code.text, _password.text);
        if (!mounted) return;
        Navigator.of(context).popUntil((r) => r.isFirst);
        snack(context, tr('Mot de passe réinitialisé. Vous êtes connecté.'));
      } on ApiException catch (e) {
        if (mounted) setState(() => _error = e.message);
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthService>();
    return Scaffold(
      appBar: AppBar(title: Text(tr('Réinitialiser le mot de passe'))),
      body: Constrained(
        maxWidth: 520,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Text(tr('Saisissez le code de réinitialisation fourni par votre administrateur, puis choisissez un nouveau mot de passe.'),
              style: TextStyle(color: context.tones.muted)),
          const SizedBox(height: 16),
          TextField(
            controller: _code,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            style: const TextStyle(fontSize: 22, letterSpacing: 3, fontWeight: FontWeight.w600),
            decoration: const InputDecoration(hintText: 'XXXX-XXXX'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: InputDecoration(labelText: tr('Nouveau mot de passe (8 caractères minimum)')),
            onSubmitted: (_) => _submit(auth),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: TextStyle(color: context.colors.error))),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : () => _submit(auth), child: Text(tr('Réinitialiser le mot de passe'))),
        ]),
      ),
    );
  }
}

/// Création de compte en un seul code :
/// - code d'invitation (8 caractères, ex. K7XQ-M2PA) : e-mail et groupe pré-remplis, il reste nom + mot de passe ;
/// - code de groupe (6 caractères, ex. H7KQ2M) : nom du groupe affiché, il reste nom + e-mail + mot de passe.
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
  Map<String, dynamic>? _found; // aperçu du code (invitation ou groupe)
  bool _noCode = false; // inscription ouverte : création de compte par e-mail sans code d'invitation
  bool _busy = false;
  String? _error;

  bool get _isInvitation => _found?['type'] == 'invitation';

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

  /// Vérifie le code dès qu'il est complet (6 ou 8 caractères), sans bouton à toucher.
  void _onCodeChanged(String v) {
    final n = v.toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '').length;
    if (_found != null) setState(() => _found = null);
    if (n == 6 || n == 8) _check();
  }

  void _check() => _run(() async {
        final asked = _code.text;
        final r = await context.read<AuthService>().previewCode(asked);
        if (!mounted || _code.text != asked) return; // code modifié entre-temps : réponse périmée
        setState(() {
          _found = r;
          if (r['type'] == 'invitation') _email.text = r['email'] as String;
        });
      });

  void _done() {
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    snack(context, tr('Bienvenue ! Votre compte est prêt.'));
  }

  void _submit(AuthService auth) {
    if (_name.text.trim().length < 2) return setState(() => _error = tr('Indiquez votre nom.'));
    if (!_isInvitation && !_email.text.contains('@')) return setState(() => _error = tr('Indiquez votre adresse e-mail.'));
    if (_password.text.length < 8) return setState(() => _error = tr('Le mot de passe doit faire au moins 8 caractères.'));
    _run(() async {
      await auth.register(
        email: _isInvitation ? null : _email.text.trim(),
        password: _password.text,
        displayName: _name.text.trim(),
        code: _noCode ? null : _code.text,
      );
      _done();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthService>();
    final found = _found;
    final ready = found != null || _noCode;
    return Scaffold(
      appBar: AppBar(title: Text(tr('Créer un compte'))),
      body: Constrained(
        maxWidth: 520,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          if (!_noCode) ...[
            Text(tr('Votre code'), style: context.text.headlineSmall),
            const SizedBox(height: 6),
            Text(tr('Code d’invitation reçu par e-mail (8 caractères, ex. K7XQ-M2PA) ou code de votre groupe (6 caractères).'),
                style: TextStyle(color: context.tones.muted)),
            const SizedBox(height: 16),
            TextField(
              controller: _code,
              // Champ toujours modifiable : le désactiver pendant la vérification, alors qu'il a le focus,
              // provoque une erreur du moteur web (version iPhone/navigateur). Une saisie pendant la
              // vérification relance simplement la vérification.
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              style: const TextStyle(fontSize: 24, letterSpacing: 3, fontWeight: FontWeight.w600),
              decoration: InputDecoration(
                hintText: 'XXXX-XXXX',
                suffixIcon: _busy && found == null
                    ? const Padding(padding: EdgeInsets.all(12), child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)))
                    : found != null
                        ? Icon(Icons.check_circle, color: context.colors.primary)
                        : null,
              ),
              onChanged: _onCodeChanged,
              onSubmitted: (_) => _check(),
            ),
          ],
          if (ready) ...[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: _noCode
                    ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(tr('Nouveau compte'), style: context.text.titleLarge),
                        const SizedBox(height: 6),
                        Text(tr('Créez votre compte avec votre e-mail. Votre progression sera sauvegardée et vous la retrouverez sur tous vos appareils.'),
                            style: TextStyle(color: context.tones.muted)),
                      ])
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (found!['groupName'] != null) ...[
                          Text(tr('Groupe'), style: TextStyle(color: context.tones.muted)),
                          Text(found['groupName'] as String, style: context.text.titleLarge),
                        ] else
                          Text(tr('Invitation valide'), style: context.text.titleLarge),
                        if (_isInvitation) ...[
                          const SizedBox(height: 8),
                          Row(children: [
                            Icon(Icons.mail_outline, size: 18, color: context.tones.muted),
                            const SizedBox(width: 6),
                            Expanded(child: Text(found['email'] as String, style: const TextStyle(fontWeight: FontWeight.w600))),
                          ]),
                          if (found['invitedBy'] != null) Text(tr('De la part de : {name}', {'name': found['invitedBy']})),
                          if (found['role'] == 'admin') Text(tr('Rôle : administrateur'), style: TextStyle(color: context.colors.primary)),
                        ],
                      ]),
              ),
            ),
            const SizedBox(height: 16),
            if (auth.googleEnabled) ...[
              FilledButton.icon(
                onPressed: _busy ? null : () => _run(() async {
                      if (await auth.signInWithGoogle(invitationCode: _noCode ? null : _code.text)) _done();
                    }),
                icon: const Icon(Icons.login),
                label: Text(tr('Continuer avec Google')),
              ),
              const SizedBox(height: 16),
              Text(tr('Ou créez un mot de passe'), style: context.text.titleMedium),
              const SizedBox(height: 10),
            ],
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: tr('Votre nom (visible par votre groupe)'))),
            if (!_isInvitation) ...[
              const SizedBox(height: 10),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: InputDecoration(labelText: tr('E-mail'))),
            ],
            const SizedBox(height: 10),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: InputDecoration(labelText: tr('Mot de passe (8 caractères minimum)')),
              onSubmitted: (_) => _submit(auth),
            ),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : () => _submit(auth), child: Text(tr('Créer mon compte'))),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: TextStyle(color: context.colors.error))),
          if (!ready) ...[
            const SizedBox(height: 28),
            Text(tr('Pas de code ? Vous pouvez créer un compte directement pour garder votre progression sur tous vos appareils.'), style: TextStyle(color: context.tones.muted)),
            TextButton(
              onPressed: _busy ? null : () => setState(() => _noCode = true),
              child: Text(tr('Créer un compte sans code')),
            ),
          ],
        ]),
      ),
    );
  }
}
