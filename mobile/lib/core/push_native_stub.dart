// Version web : pas d'alertes natives Firebase (le Web Push passe par push_web.dart).
bool nativePushSupported() => false;
Future<String> nativePushPermission() async => 'unsupported';
Future<bool> nativePushRequestPermission() async => false;
Future<String?> nativePushToken({bool ask = false}) async => null;
Future<void> nativePushDeleteToken() async {}
Future<Stream<String>> nativePushTokenRefresh() async => const Stream.empty();
Future<void> nativePushListen({
  required void Function(Map<String, String>) onReceived,
  required void Function(Map<String, String>) onOpened,
}) async {}
