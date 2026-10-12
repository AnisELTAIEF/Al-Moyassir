/// Configuration injectée à la compilation (voir README) :
///   flutter run --dart-define=API_URL=https://quran.exemple.com/api \
///               --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com \
///               --dart-define=GOOGLE_IOS_CLIENT_ID=yyyy.apps.googleusercontent.com
/// Sans API_URL, l'app fonctionne en mode local (lecture, audio, mémorisation sur l'appareil).
class Env {
  static const apiUrl = String.fromEnvironment('API_URL');
  static const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
  static const googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');
  static bool get online => apiUrl.isNotEmpty;
  static bool get googleEnabled => online && googleServerClientId.isNotEmpty;
}
