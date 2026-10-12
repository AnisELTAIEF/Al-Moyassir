import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/auth_service.dart';
import 'core/settings.dart';
import 'screens/home_screen.dart';
import 'screens/review_screen.dart';
import 'screens/supervision_screen.dart';
import 'screens/surah_list_screen.dart';
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

class _ShellState extends State<Shell> {
  int _index = 0;

  void go(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final canSupervise = context.select<AuthService, bool>((a) => a.canSupervise);
    final tabs = <(IconData, IconData, String, Widget)>[
      (Icons.home_outlined, Icons.home, tr('Accueil'), HomeScreen(onOpenTab: go)),
      (Icons.menu_book_outlined, Icons.menu_book, tr('Lire'), const SurahListScreen()),
      (Icons.replay_outlined, Icons.replay, tr('Réviser'), const ReviewScreen()),
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
