import 'package:flutter/material.dart';

/// Palette inspirée des mushafs maghrébins : encre (midad), vert des zelliges,
/// rouge garance des voyelles et jaune safran des hamzas, sur le blanc chaulé des murs.
class Palette {
  static const ink = Color(0xFF17201F);
  static const inkSoft = Color(0xFF4A5654);
  static const zellige = Color(0xFF0D5C4B);
  static const zelligeDeep = Color(0xFF083F34);
  static const madder = Color(0xFFA93226);
  static const saffron = Color(0xFFD9A21B);
  static const limewash = Color(0xFFF5F6F2);
  static const line = Color(0xFFDCE1DC);

  static const nightBg = Color(0xFF0F1615);
  static const nightSurface = Color(0xFF172220);
  static const nightLine = Color(0xFF2A3835);
  static const zelligeLight = Color(0xFF4FB596);
  static const saffronLight = Color(0xFFE6B84A);
}

/// Couleurs propres à l'app, accessibles via `context.tones`.
class Tones extends ThemeExtension<Tones> {
  const Tones({required this.line, required this.gold, required this.red, required this.muted, required this.page});
  final Color line;
  final Color gold;
  final Color red;
  final Color muted;
  final Color page;

  @override
  Tones copyWith({Color? line, Color? gold, Color? red, Color? muted, Color? page}) =>
      Tones(line: line ?? this.line, gold: gold ?? this.gold, red: red ?? this.red, muted: muted ?? this.muted, page: page ?? this.page);

  @override
  Tones lerp(Tones? other, double t) => other == null
      ? this
      : Tones(
          line: Color.lerp(line, other.line, t)!,
          gold: Color.lerp(gold, other.gold, t)!,
          red: Color.lerp(red, other.red, t)!,
          muted: Color.lerp(muted, other.muted, t)!,
          page: Color.lerp(page, other.page, t)!,
        );
}

extension ToneContext on BuildContext {
  Tones get tones => Theme.of(this).extension<Tones>()!;
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
}

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final scheme = ColorScheme.fromSeed(seedColor: Palette.zellige, brightness: b).copyWith(
    primary: dark ? Palette.zelligeLight : Palette.zellige,
    onPrimary: dark ? Palette.nightBg : Colors.white,
    secondary: dark ? Palette.saffronLight : Palette.saffron,
    onSecondary: Palette.ink,
    tertiary: Palette.madder,
    error: dark ? const Color(0xFFFF8A80) : Palette.madder,
    surface: dark ? Palette.nightSurface : Colors.white,
    onSurface: dark ? const Color(0xFFE7ECE9) : Palette.ink,
    onSurfaceVariant: dark ? const Color(0xFFA3B1AC) : Palette.inkSoft,
    outlineVariant: dark ? Palette.nightLine : Palette.line,
  );
  final tones = Tones(
    line: dark ? Palette.nightLine : Palette.line,
    gold: dark ? Palette.saffronLight : Palette.saffron,
    red: dark ? const Color(0xFFE07A6E) : Palette.madder,
    muted: dark ? const Color(0xFFA3B1AC) : Palette.inkSoft,
    page: dark ? Palette.nightBg : Palette.limewash,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: 'ReadexPro', brightness: b);
  final t = base.textTheme;
  return base.copyWith(
    scaffoldBackgroundColor: tones.page,
    extensions: [tones],
    textTheme: t.copyWith(
      displaySmall: t.displaySmall?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.5),
      headlineMedium: t.headlineMedium?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.3),
      headlineSmall: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
      titleLarge: t.titleLarge?.copyWith(fontWeight: FontWeight.w600),
      titleMedium: t.titleMedium?.copyWith(fontWeight: FontWeight.w500),
      bodyMedium: t.bodyMedium?.copyWith(height: 1.45),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: tones.page,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: 'ReadexPro', fontSize: 21, fontWeight: FontWeight.w600, color: scheme.onSurface),
    ),
    cardTheme: CardThemeData(
      color: scheme.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: tones.line)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surface,
      indicatorColor: scheme.primary.withValues(alpha: 0.14),
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStatePropertyAll(t.labelMedium?.copyWith(fontFamily: 'ReadexPro')),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: scheme.surface,
      indicatorColor: scheme.primary.withValues(alpha: 0.14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(48, 50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(48, 50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: tones.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: tones.line)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: scheme.surface, showDragHandle: true, surfaceTintColor: Colors.transparent),
    dividerTheme: DividerThemeData(color: tones.line, space: 1),
  );
}
