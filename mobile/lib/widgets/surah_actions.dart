import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../core/progress_store.dart';
import '../core/quran_repository.dart';
import '../theme.dart';
import 'common.dart';
import '../core/i18n.dart';

/// Marque toute une sourate (appris / en cours / retirer), avec « Annuler ».
Future<void> setWholeSurah(BuildContext context, int surah, AyahStatus? status) async {
  final store = context.read<ProgressStore>();
  final s = context.read<QuranRepository>().surah(surah);
  final before = store.snapshotSurah(surah);
  await store.setRange(surah, List.generate(s.ayahCount, (i) => i + 1), status);
  if (!context.mounted) return;
  final what = switch (status) {
    AyahStatus.memorized => tr('apprise'),
    AyahStatus.learning => tr('en cours d’apprentissage'),
    null => tr('retirée du suivi'),
  };
  snack(context, tr('{name} : sourate {what} ({n} ayat)', {'name': s.name, 'what': what, 'n': s.ayahCount}),
      action: SnackBarAction(label: tr('Annuler'), onPressed: () => store.restoreSurah(surah, before)));
}

/// Menu des actions de sourate.
Future<void> showSurahMenu(BuildContext context, int surah) async {
  final store = context.read<ProgressStore>();
  final s = context.read<QuranRepository>().surah(surah);
  final memorized = store.memorizedIn(surah);
  final choice = await showModalBottomSheet<String>(
    context: context,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          title: ArabicText(s.name, size: 26, height: 1.4),
          subtitle: Text(tr('Sourate {s} · {n} ayat · {m} appris', {'s': surah, 'n': s.ayahCount, 'm': memorized})),
        ),
        const Divider(),
        if (memorized < s.ayahCount)
          ListTile(leading: const Icon(Icons.verified_outlined), title: Text(tr('Marquer toute la sourate comme apprise')), onTap: () => Navigator.pop(c, 'memorized')),
        ListTile(leading: const Icon(Icons.timelapse), title: Text(tr('Marquer toute la sourate en cours')), onTap: () => Navigator.pop(c, 'learning')),
        if (store.trackedIn(surah) > 0)
          ListTile(leading: const Icon(Icons.remove_circle_outline), title: Text(tr('Retirer la sourate du suivi')), onTap: () => Navigator.pop(c, 'none')),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (choice == null || !context.mounted) return;
  await setWholeSurah(context, surah, switch (choice) { 'memorized' => AyahStatus.memorized, 'learning' => AyahStatus.learning, _ => null });
}

/// Nom d'une division (« Juz 3 », « Hizb 5 ») dans la langue de l'interface.
String divisionName({int? juz, int? hizb}) =>
    juz != null ? tr('Juz {n}', {'n': juz}) : tr('Hizb {n}', {'n': hizb});

/// Marque un ensemble d'ayat (hizb, juz) avec « Annuler ».
Future<void> setAyahRange(BuildContext context, String title, List<AyahRef> refs, AyahStatus? status) async {
  final store = context.read<ProgressStore>();
  final before = store.snapshotAyahs(refs);
  await store.setAyahs(refs, status);
  if (!context.mounted) return;
  final what = switch (status) {
    AyahStatus.memorized => tr('appris'),
    AyahStatus.learning => tr('en cours d’apprentissage'),
    null => tr('retiré du suivi'),
  };
  snack(context, tr('{name} : {what} ({n} ayat)', {'name': title, 'what': what, 'n': refs.length}),
      action: SnackBarAction(label: tr('Annuler'), onPressed: () => store.restoreAyahs(before)));
}

/// Menu des actions d'un hizb ou d'un juz.
Future<void> showRangeMenu(BuildContext context, {required String title, required String subtitle, required List<AyahRef> refs}) async {
  final store = context.read<ProgressStore>();
  final (memorized, tracked) = store.countIn(refs);
  final choice = await showModalBottomSheet<String>(
    context: context,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          title: Text(title, style: c.text.titleLarge),
          subtitle: Text(tr('{sub} · {n} ayat · {m} appris', {'sub': subtitle, 'n': refs.length, 'm': memorized})),
        ),
        const Divider(),
        if (memorized < refs.length)
          ListTile(leading: const Icon(Icons.verified_outlined), title: Text(tr('Marquer tout comme appris')), onTap: () => Navigator.pop(c, 'memorized')),
        ListTile(leading: const Icon(Icons.timelapse), title: Text(tr('Marquer tout en cours')), onTap: () => Navigator.pop(c, 'learning')),
        if (tracked > 0)
          ListTile(leading: const Icon(Icons.remove_circle_outline), title: Text(tr('Retirer du suivi')), onTap: () => Navigator.pop(c, 'none')),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (choice == null || !context.mounted) return;
  await setAyahRange(context, title, refs, switch (choice) { 'memorized' => AyahStatus.memorized, 'learning' => AyahStatus.learning, _ => null });
}
