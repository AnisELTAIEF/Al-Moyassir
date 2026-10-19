import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../core/settings.dart';
import '../theme.dart';
import '../core/i18n.dart';

/// Texte coranique (police embarquée, droite → gauche).
class ArabicText extends StatelessWidget {
  const ArabicText(this.text, {super.key, this.size = 28, this.color, this.justify = false, this.height = 2.0, this.weight});
  final String text;
  final double size;
  final Color? color;
  final bool justify;
  final double height;
  final FontWeight? weight;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textDirection: TextDirection.rtl,
        textAlign: justify ? TextAlign.justify : TextAlign.start,
        style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: size, height: height, color: color, fontWeight: weight),
      );
}

String fmtDate(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

String since(DateTime? d) {
  if (d == null) return tr('jamais');
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 1) return tr('à l’instant');
  if (diff.inHours < 1) return tr('il y a {n} min', {'n': diff.inMinutes});
  if (diff.inDays < 1) return tr('il y a {n} h', {'n': diff.inHours});
  if (diff.inDays == 1) return tr('hier');
  if (diff.inDays < 30) return tr('il y a {n} j', {'n': diff.inDays});
  return tr('le {d}', {'d': fmtDate(d)});
}

String pct(num part, num total) {
  if (total == 0) return '0 %';
  final v = part * 100 / total;
  return '${v.toStringAsFixed(v < 10 && v > 0 ? 1 : 0).replaceAll('.', ',')} %';
}

void snack(BuildContext context, String msg, {SnackBarAction? action}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), action: action, persist: false, duration: Duration(seconds: action == null ? 3 : 6)));
}

Future<bool> confirm(BuildContext context, {required String title, required String body, String? ok, bool danger = false}) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('Annuler'))),
          FilledButton(
            style: danger ? FilledButton.styleFrom(backgroundColor: c.colors.error) : null,
            onPressed: () => Navigator.pop(c, true),
            child: Text(ok ?? tr('Confirmer')),
          ),
        ],
      ),
    ) ??
    false;

/// Limite la largeur du contenu sur tablette.
class Constrained extends StatelessWidget {
  const Constrained({super.key, required this.child, this.maxWidth = 760});
  final Widget child;
  final double maxWidth;
  @override
  Widget build(BuildContext context) => Center(child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child));
}

/// Écran vide ou erreur : dit quoi faire.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 48, color: context.tones.muted),
            const SizedBox(height: 16),
            Text(title, style: context.text.titleMedium, textAlign: TextAlign.center),
            if (body != null) ...[const SizedBox(height: 8), Text(body!, textAlign: TextAlign.center, style: TextStyle(color: context.tones.muted))],
            if (action != null) ...[const SizedBox(height: 20), action!],
          ]),
        ),
      );
}

/// Barre de progression fine aux bords arrondis.
class ThinBar extends StatelessWidget {
  const ThinBar({super.key, required this.value, this.color, this.height = 6});
  final double value;
  final Color? color;
  final double height;
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(height),
        child: LinearProgressIndicator(
          value: value.clamp(0, 1),
          minHeight: height,
          color: color ?? context.colors.primary,
          backgroundColor: context.tones.line,
        ),
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 24, 4, 10),
        child: Row(children: [Expanded(child: Text(title, style: context.text.titleMedium)), ?trailing]),
      );
}

/// Bascule clair ↔ sombre à partir de l'apparence actuellement affichée.
void toggleTheme(BuildContext context) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  context.read<Settings>().themeMode = dark ? ThemeMode.light : ThemeMode.dark;
}
