import 'i18n_ar.dart';

/// Langues de l'interface. Le texte coranique, lui, est toujours en arabe.
enum AppLang { fr, ar }

/// Langue courante de l'interface (fixée par [Settings] ; l'app est reconstruite quand elle change).
class I18n {
  static AppLang lang = AppLang.fr;
  static bool get isAr => lang == AppLang.ar;
}

/// Traduit une phrase de l'interface. La clé est le texte français ; les variables s'écrivent
/// `{nom}` et sont remplacées par [args]. Sans traduction connue, le français est affiché.
String tr(String fr, [Map<String, Object?> args = const {}]) {
  var s = I18n.isAr ? (arStrings[fr] ?? fr) : fr;
  args.forEach((k, v) => s = s.replaceAll('{$k}', '$v'));
  return s;
}
