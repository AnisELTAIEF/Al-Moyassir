import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/auth_service.dart';
import 'core/prayer_service.dart';
import 'core/push_service.dart';
import 'core/settings.dart';
import 'core/validation_store.dart';
import 'screens/home_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/review_screen.dart';
import 'screens/supervision_screen.dart';
import 'screens/surah_list_screen.dart';
import 'screens/worship_screen.dart';
import 'theme.dart';
import 'core/i18n.dart';

class HifidhApp extends StatelessWidget {
  const HifidhApp({super.key});

  @override
  Widget build(BuildContext context) {
    final mode = context.select<Settings, ThemeMode>((s) => s.themeMode);
    final lang = context.select<Settings, AppLang>((s) => s.effectiveLang(WidgetsBinding.instance.platformDispatcher.locale));
    I18n.lang = lang;
    return MaterialApp(
      // Changer de langue reconstruit toute l'interface (et revient à l'accueil).
      key: ValueKey(lang),
      locale: Locale(lang.name),
      supportedLocales: const [Locale('fr'), Locale('ar')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      title: tr('Almoyassir — الميسّر'),
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: mode,
      home: const Shell(),
    );
  }
}

/// Navigation principale : barre du bas sur téléphone, rail latéral sur tablette.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  int _index = 0;
  Timer? _poll;
  late final PushService _push = context.read<PushService>();

  void go(int i) => setState(() => _index = i);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    context.read<ValidationStore>().addListener(_onValidations);
    // Rappel in-app (Phase 1) : une prière arrive alors que l'app est ouverte → bandeau.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<PrayerService>().onDue = _announcePrayer;
      // Alertes de l'enseignant : touchée → sa notification ; reçue app ouverte → mise à jour + bandeau.
      _push.onReceived = _onPushReceived;
      _push.onOpened = (a) => _openNotification(a.id);
    });
    _startPolling();
  }

  /// Filet de sécurité quand les alertes sont désactivées : nouvelles validations toutes les 2 minutes,
  /// seulement pendant que l'app est à l'écran.
  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(minutes: 2), (_) => context.read<ValidationStore>().refresh());
  }

  void _openNotification(int? id) {
    context.read<ValidationStore>().refresh();
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => NotificationsScreen(openId: id)));
  }

  void _onPushReceived(PushAlert a) {
    context.read<ValidationStore>().refresh();
    final text = [a.title, a.body].where((t) => t != null && t.isNotEmpty).join('\n');
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
      persist: false,
      duration: const Duration(seconds: 8),
      content: Text(text.isEmpty ? tr('Nouvelle notification') : text),
      action: SnackBarAction(label: tr('Voir'), onPressed: () => _openNotification(a.id)),
    ));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _push.onReceived = null;
    _push.onOpened = null;
    WidgetsBinding.instance.removeObserver(this);
    context.read<ValidationStore>().removeListener(_onValidations);
    super.dispose();
  }

  /// Première validation reçue : on active, une seule fois, les couleurs de l'enseignant dans le mushaf
  /// (sauf si l'élève avait déjà choisi lui-même une colorisation), et on le lui dit.
  void _onValidations() {
    final v = context.read<ValidationStore>();
    final s = context.read<Settings>();
    if (!v.hasAny || s.validationIntroduced) return;
    s.validationIntroduced = true;
    if (s.hasColoringChoice(ReadingMode.mushaf)) return;
    s.setColoringIn(ReadingMode.mushaf, AyahColoring.validation);
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
      duration: const Duration(seconds: 8),
      content: Text(tr('Votre enseignant a validé une partie de votre mémorisation : ses couleurs sont activées dans le mushaf (modifiable dans la colorisation).')),
    ));
  }

  /// Au retour dans l'app : nouvelles validations et notifications de l'enseignant.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<ValidationStore>().refresh();
      _startPolling();
    } else if (state == AppLifecycleState.paused) {
      _poll?.cancel();
    }
  }

  void _announcePrayer(Salat s) {
    final m = ScaffoldMessenger.maybeOf(context);
    final name = I18n.isAr ? s.ar : s.fr;
    m?.showSnackBar(SnackBar(
      persist: false,
      duration: const Duration(seconds: 6),
      content: Text(tr('C’est l’heure de la prière ({name})', {'name': name})),
      action: SnackBarAction(label: tr('Horaires'), onPressed: () => go(3)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final canSupervise = context.select<AuthService, bool>((a) => a.canSupervise);
    final tabs = <(IconData, IconData, String, Widget)>[
      (Icons.home_outlined, Icons.home, tr('Accueil'), HomeScreen(onOpenTab: go)),
      (Icons.menu_book_outlined, Icons.menu_book, tr('Lire'), const SurahListScreen()),
      (Icons.replay_outlined, Icons.replay, tr('Réviser'), const ReviewScreen()),
      (Icons.mosque_outlined, Icons.mosque, tr('Prière'), const WorshipScreen()),
      if (canSupervise) (Icons.groups_outlined, Icons.groups, tr('Suivi'), const SupervisionScreen()),
    ];
    final index = _index.clamp(0, tabs.length - 1);
    final body = IndexedStack(index: index, children: [for (final t in tabs) t.$4]);
    final wide = MediaQuery.sizeOf(context).width >= 720;

    if (wide) {
      return Scaffold(
        body: Row(children: [
          NavigationRail(
            selectedIndex: index,
            onDestinationSelected: go,
            labelType: NavigationRailLabelType.all,
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text('الميسّر', style: TextStyle(fontFamily: 'ScheherazadeNew', fontSize: 30, color: context.colors.primary)),
            ),
            destinations: [
              for (final t in tabs) NavigationRailDestination(icon: Icon(t.$1), selectedIcon: Icon(t.$2), label: Text(t.$3)),
            ],
          ),
          VerticalDivider(width: 1, color: context.tones.line),
          Expanded(child: body),
        ]),
      );
    }
    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: go,
        destinations: [for (final t in tabs) NavigationDestination(icon: Icon(t.$1), selectedIcon: Icon(t.$2), label: t.$3)],
      ),
    );
  }
}
