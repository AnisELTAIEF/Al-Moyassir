import 'package:flutter/foundation.dart' show kIsWeb;

/// Configuration injectée à la compilation (voir README) :
///   flutter run --dart-define=API_URL=https://quran.exemple.com/api \
///               --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com \
///               --dart-define=GOOGLE_IOS_CLIENT_ID=yyyy.apps.googleusercontent.com
/// Sans compte, l'app fonctionne quand même (lecture, audio, mémorisation sur l'appareil).
class Env {
  /// Serveur officiel, figé dans l'app (modifiable seulement à la compilation : --dart-define=API_URL=…).
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://quran.bestconsultingit.com/api');
  static const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
  /// Client « application Web » de Google (le même que celui du serveur) : connexion Google de la version web.
  /// Doit autoriser l'origine du site et l'adresse de retour …/app/google-callback.html dans la console Google.
  static const googleWebClientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID',
      defaultValue: '586035176657-irsd876l7i5kd5ol7mjoq1ht0fedpad5.apps.googleusercontent.com');
  static const googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');
  static bool get online => apiUrl.isNotEmpty;

  /// Version web (iPhone, navigateur), servie par le même serveur : …/api → …/app/.
  static String get webAppUrl => apiUrl.isEmpty ? '' : '${apiUrl.replaceFirst(RegExp(r'/api/?$'), '')}/app/';
  static bool get googleEnabled => online && (kIsWeb ? googleWebClientId.isNotEmpty : googleServerClientId.isNotEmpty);
}
