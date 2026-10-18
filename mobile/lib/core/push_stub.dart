// Plateformes sans Web Push (application native) : aucune alerte « app fermée » ici.
// Les alertes natives demandent un projet Firebase (compte à créer), voir docs/PLAN-EXECUTION.md lot G.
bool pushSupported() => false;
String pushPermission() => 'unsupported';
Future<bool> pushSubscribed() async => false;
Future<Map<String, dynamic>?> pushSubscribe(String vapidKey) async => null;
Future<String?> pushUnsubscribe() async => null;
void pushListen(void Function(Map<String, dynamic> message) onMessage) {}
String? pushLaunchId() => null;
