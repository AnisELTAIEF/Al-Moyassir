// Version web : pas d'alertes natives Firebase (le Web Push passe par push_web.dart).
bool nativePushSupported() => false;
Future<String> nativePushPermission() async => 'unsupported';
Future<String?> nativePushToken({bool ask = false}) async => null;
Future<void> nativePushDeleteToken() async {}
Future<Stream<String>> nativePushTokenRefresh() async => const Stream.empty();
