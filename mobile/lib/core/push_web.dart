// Web Push (version web / PWA) : passerelle vers web/push.js.
import 'dart:convert';
import 'dart:js_interop';

@JS('hifidhPush')
external _Push? get _push;

extension type _Push._(JSObject _) implements JSObject {
  external bool supported();
  external String permission();
  external JSPromise<JSString?> subscribe(String vapidKey);
  external JSPromise<JSString?> unsubscribe();
  external JSPromise<JSBoolean> subscribed();
  external void listen(JSFunction cb);
}

bool pushSupported() => _push?.supported() ?? false;
String pushPermission() => _push?.permission() ?? 'unsupported';
Future<bool> pushSubscribed() async => (await _push?.subscribed().toDart)?.toDart ?? false;

/// Demande l'autorisation puis s'abonne ; renvoie `{endpoint, keys: {p256dh, auth}}`, ou null si refusé.
Future<Map<String, dynamic>?> pushSubscribe(String vapidKey) async {
  final json = (await _push?.subscribe(vapidKey).toDart)?.toDart;
  return json == null ? null : jsonDecode(json) as Map<String, dynamic>;
}

Future<String?> pushUnsubscribe() async => (await _push?.unsubscribe().toDart)?.toDart;

/// Messages du service worker : `{hifidhPush: 'received' | 'opened', id, kind, title?, body?}`.
void pushListen(void Function(Map<String, dynamic> message) onMessage) =>
    _push?.listen(((JSString json) => onMessage(jsonDecode(json.toDart) as Map<String, dynamic>)).toJS);

/// App ouverte par le toucher d'une alerte (`/app/?notif=12`) : la notification à afficher.
String? pushLaunchId() => Uri.base.queryParameters['notif'];
