import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../theme.dart';
import 'common.dart';
import '../core/i18n.dart';

/// Affiche le code d'une invitation (visible une seule fois) avec partage et copie.
Future<void> showInvitationSheet(BuildContext context,
    {required String email, required String code, required String message, String? subject, bool emailed = false}) {
  return showModalBottomSheet(
    context: context,
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(emailed ? tr('E-mail d’invitation envoyé à {email}', {'email': email}) : tr('Invitation créée pour {email}', {'email': email}),
              style: c.text.titleMedium),
          const SizedBox(height: 4),
          Text(
              emailed
                  ? tr('Le message détaillé (liens, étapes, guide) est parti. Vous pouvez aussi le partager vous-même.')
                  : tr('Envoyez-lui ce message : il contient le code, les liens et les étapes. Le code ne sera plus affiché ensuite.'),
              style: TextStyle(color: c.tones.muted)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 18),
            decoration: BoxDecoration(color: c.colors.primary, borderRadius: BorderRadius.circular(16)),
            child: SelectableText(code,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 32, letterSpacing: 4, fontWeight: FontWeight.w700, color: c.colors.onPrimary)),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => SharePlus.instance.share(ShareParams(text: message, subject: subject ?? tr('Invitation Almoyassir (الميسّر)'))),
            icon: const Icon(Icons.share),
            label: Text(tr('Partager (WhatsApp, e-mail…)')),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: message));
              snack(context, tr('Message d’invitation copié'));
            },
            icon: const Icon(Icons.copy),
            label: Text(tr('Copier le message')),
          ),
        ]),
      ),
    ),
  );
}
