import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'i18n.dart';

class Settings extends ChangeNotifier {
  Settings(this._prefs)
      : _fontSize = _prefs.getDouble('font_size') ?? 28,
        _lastRead = _prefs.getString('last_read'),
        _themeMode = ThemeMode.values.byName(_prefs.getString('theme_mode') ?? 'system'),
        _tajweed = _prefs.getBool('tajweed') ?? true,
        _language = _prefs.getString('language') ?? _initialLanguage(_prefs),
        _readingMode = ReadingMode.values.asNameMap()[_prefs.getString('reading_mode')] ?? ReadingMode.ayah;

  /// Langue d'une installation qui n'a encore rien choisi : arabe pour une nouvelle installation ;
  /// pour quelqu'un qui utilisait déjà l'app avant ce réglage, on garde « selon le téléphone »
  /// (sinon la mise à jour le ferait passer en arabe sans l'avoir demandé). Le choix est mémorisé.
  static String _initialLanguage(SharedPreferences prefs) {
    const usedBefore = ['last_read', 'font_size', 'theme_mode', 'reading_mode'];
    final lang = usedBefore.any(prefs.containsKey) ? 'system' : 'ar';
    prefs.setString('language', lang);
    return lang;
  }

  final SharedPreferences _prefs;
  double _fontSize;
  String? _lastRead;
  ThemeMode _themeMode;
  final bool _tajweed;
  String _language;
  ReadingMode _readingMode;

  /// Langue de l'interface : 'system' (celle du téléphone), 'fr' ou 'ar'.
  String get language => _language;
  set language(String v) {
    _language = v;
    _prefs.setString('language', v);
    notifyListeners();
  }

  /// Langue effective, selon le réglage et la langue du téléphone (arabe → arabe, sinon français).
  AppLang effectiveLang(Locale device) => switch (_language) {
        'ar' => AppLang.ar,
        'fr' => AppLang.fr,
        _ => device.languageCode == 'ar' ? AppLang.ar : AppLang.fr,
      };

  /// Mode de lecture : ayah par ayah (par défaut), pages à la taille de l'écran, ou pages du mushaf (604).
  ReadingMode get readingMode => _readingMode;
  set readingMode(ReadingMode v) {
    _readingMode = v;
    _prefs.setString('reading_mode', v.name);
    notifyListeners();
  }

  /// Compte dont on lit les réglages de colorisation ('local' hors connexion).
  String _owner = 'local';
  String get owner => _owner;
  set owner(String? id) {
    final o = id ?? 'local';
    if (o == _owner) return;
    _owner = o;
    notifyListeners();
  }

  /// Couleurs du tajwid (lettres) dans le mode de lecture courant.
  bool get tajweed => tajweedIn(_readingMode);
  set tajweed(bool v) => setTajweedIn(_readingMode, v);

  /// Couleurs du tajwid dans un mode, par compte (par défaut : l'ancien réglage global).
  bool tajweedIn(ReadingMode m) => _prefs.getBool('tajweed_${_owner}_${m.name}') ?? _tajweed;
  void setTajweedIn(ReadingMode m, bool v) {
    _prefs.setBool('tajweed_${_owner}_${m.name}', v);
    notifyListeners();
  }

  /// Colorisation des ayat (fond) dans le mode de lecture courant.
  AyahColoring get coloring => coloringIn(_readingMode);

  /// Colorisation par défaut d'un mode : « par ayah » en Tahfidh (alternance douce),
  /// « par niveau de maîtrise » en Qira'a (plus utile pour suivre sa mémorisation à la lecture).
  static AyahColoring defaultColoring(ReadingMode m) => m == ReadingMode.mushaf ? AyahColoring.mastery : AyahColoring.perAyah;

  /// Colorisation des ayat dans un mode, par compte (voir [defaultColoring]).
  AyahColoring coloringIn(ReadingMode m) =>
      AyahColoring.values.asNameMap()[_prefs.getString('coloring_${_owner}_${m.name}')] ?? defaultColoring(m);
  void setColoringIn(ReadingMode m, AyahColoring c) {
    _prefs.setString('coloring_${_owner}_${m.name}', c.name);
    notifyListeners();
  }

  /// L'élève a-t-il lui-même choisi une colorisation pour ce mode ? (sinon : celle par défaut)
  bool hasColoringChoice(ReadingMode m) => _prefs.containsKey('coloring_${_owner}_${m.name}');

  /// Les couleurs de la validation de l'enseignant ont-elles déjà été activées (une seule fois par compte) ?
  bool get validationIntroduced => _prefs.getBool('validation_intro_$_owner') ?? false;
  set validationIntroduced(bool v) => _prefs.setBool('validation_intro_$_owner', v);

  /// « Votre khatma » de l'accueil : mosaïque des 114 sourates (défaut) ou des 604 pages du mushaf.
  bool get khatmaByPage => _prefs.getBool('khatma_pages_$_owner') ?? false;
  set khatmaByPage(bool v) {
    _prefs.setBool('khatma_pages_$_owner', v);
    notifyListeners();
  }

  /// Palette adaptée au daltonisme (bleu / orange / vermillon, d'après Okabe et Ito).
  bool get colorBlind => _prefs.getBool('coloring_cb_$_owner') ?? false;
  set colorBlind(bool v) {
    _prefs.setBool('coloring_cb_$_owner', v);
    notifyListeners();
  }

  /// Une révision en retard s'affiche « à revoir » (rouge) en colorisation par maîtrise.
  bool get overdueAsReview => _prefs.getBool('coloring_overdue_$_owner') ?? true;
  set overdueAsReview(bool v) {
    _prefs.setBool('coloring_overdue_$_owner', v);
    notifyListeners();
  }

  ThemeMode get themeMode => _themeMode;
  set themeMode(ThemeMode m) {
    _themeMode = m;
    _prefs.setString('theme_mode', m.name);
    notifyListeners();
  }

  double get fontSize => _fontSize;
  set fontSize(double v) {
    _fontSize = v;
    _prefs.setDouble('font_size', v);
    notifyListeners();
  }

  /// Qira'a : zoom du texte des pages du mushaf. 0 = « page entière » (le texte s'ajuste pour que
  /// toute la page tienne à l'écran, sans défilement) ; chaque niveau agrandit le texte de 20 %,
  /// et la page défile alors verticalement jusqu'à sa fin.
  static const mushafZoomMax = 6;
  int get mushafZoom => (_prefs.getInt('mushaf_zoom') ?? 0).clamp(0, mushafZoomMax);
  set mushafZoom(int v) {
    _prefs.setInt('mushaf_zoom', v.clamp(0, mushafZoomMax));
    notifyListeners();
  }

  /// Facteur d'agrandissement correspondant à [mushafZoom] (1,0 ; 1,2 ; 1,44 ; …).
  double get mushafZoomFactor {
    var f = 1.0;
    for (var i = 0; i < mushafZoom; i++) {
      f *= 1.2;
    }
    return f;
  }

  /// Dernière activité de l'utilisateur (par compte) : sert à « Prochaine étape » sur l'accueil.
  LastActivity? get lastActivity {
    final raw = _prefs.getString('last_act_$_owner')?.split('|');
    if (raw == null || raw.length != 4) return null;
    final kind = Activity.values.asNameMap()[raw[0]];
    final s = int.tryParse(raw[1]), a = int.tryParse(raw[2]), t = int.tryParse(raw[3]);
    if (kind == null || s == null || a == null || t == null) return null;
    return LastActivity(kind, s, a, DateTime.fromMillisecondsSinceEpoch(t));
  }

  /// Enregistre l'activité en cours. Ne prévient les écrans que si l'activité ou la sourate change
  /// (la position change à chaque défilement : inutile de tout reconstruire).
  void saveActivity(Activity kind, int surah, int ayah) {
    final prev = lastActivity;
    _prefs.setString('last_act_$_owner', '${kind.name}|$surah|$ayah|${DateTime.now().millisecondsSinceEpoch}');
    // Différé : cet appel peut venir d'une construction ou d'une mise en page en cours.
    if (prev == null || prev.kind != kind || prev.surah != surah) scheduleMicrotask(notifyListeners);
  }

  /// Dernière position de lecture « sourate:ayah ».
  (int, int)? get lastRead {
    final p = _lastRead?.split(':');
    if (p == null || p.length != 2) return null;
    return (int.parse(p[0]), int.parse(p[1]));
  }

  void saveLastRead(int surah, int ayah) {
    _lastRead = '$surah:$ayah';
    _prefs.setString('last_read', _lastRead!);
  }
}

/// Modes d'affichage du lecteur.
enum ReadingMode {
  /// Tahfidh : un bloc par ayah, pour écouter, répéter et marquer (par défaut).
  ayah,

  /// Qira'a : les 604 pages du mushaf de Qalun (édition de Médine), d'une sourate à l'autre.
  mushaf;

  String get label => switch (this) {
        ayah => tr('Tahfidh'),
        mushaf => tr('Qira’a'),
      };

  String get description => switch (this) {
        ayah => tr('Ayah par ayah : écouter, répéter, marquer'),
        mushaf => tr('Pages du mushaf (604)'),
      };

  IconData get icon => switch (this) {
        ayah => Icons.record_voice_over_outlined,
        mushaf => Icons.auto_stories_outlined,
      };
}

/// Colorisation du fond des ayat (le texte coranique lui-même n'est jamais modifié).
enum AyahColoring {
  none,

  /// Fond doux alterné d'un ayah à l'autre.
  perAyah,

  /// Fond selon le niveau de maîtrise (non appris, en cours, à revoir, acquis).
  mastery,

  /// Fond selon la validation de l'enseignant (acquis, acquis avec erreur, à revoir) : la référence des rapports.
  /// Les marques personnelles de l'élève restent visibles sur le médaillon de fin d'ayah.
  validation;

  String get label => switch (this) {
        none => tr('Aucune'),
        perAyah => tr('Par ayah'),
        mastery => tr('Par niveau de maîtrise'),
        validation => tr('Validation de l’enseignant'),
      };
}

/// Type d'activité, pour reprendre là où l'on s'est arrêté.
enum Activity { qiraa, tahfidh, review }

class LastActivity {
  const LastActivity(this.kind, this.surah, this.ayah, this.at);
  final Activity kind;
  final int surah, ayah;
  final DateTime at;
}
