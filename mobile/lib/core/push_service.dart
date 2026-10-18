import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'auth_service.dart';
import 'push_stub.dart' if (dart.library.js_interop) 'push_web.dart' as platform;

/// État des alertes « app fermée » sur cet appareil.
enum PushState {
  /// Pas disponibles ici (application native, ou navigateur sans Web Push : sur iPhone, installer d'abord l'app sur l'écran d'accueil).
  unsupported,

  /// Le serveur n'a pas de clés : fonction désactivée côté serveur.
  unavailable,

  /// L'utilisateur a refusé dans le navigateur : il doit réactiver dans les réglages du navigateur.
  denied,
  off,
  on,
}

/// Active ou désactive les alertes (Web Push) de l'appareil et l'enregistre auprès du serveur.
class PushService extends ChangeNotifier {
  PushService(this._auth);
  final AuthService _auth;
  PushState state = PushState.unsupported;

  Future<void> refresh() async {
    if (!platform.pushSupported() || !_auth.signedIn) {
      state = PushState.unsupported;
    } else if (platform.pushPermission() == 'denied') {
      state = PushState.denied;
    } else {
      try {
        final key = (await _auth.api!.get('/me/push/key') as Map<String, dynamic>)['publicKey'];
        state = key == null ? PushState.unavailable : (await platform.pushSubscribed() ? PushState.on : PushState.off);
      } on ApiException {
        state = PushState.off;
      }
    }
    notifyListeners();
  }

  /// À appeler depuis un geste de l'utilisateur (le navigateur l'exige pour demander l'autorisation).
  Future<bool> enable() async {
    final key = (await _auth.api!.get('/me/push/key') as Map<String, dynamic>)['publicKey'] as String?;
    if (key == null) return false;
    final sub = await platform.pushSubscribe(key);
    if (sub == null) {
      await refresh();
      return false;
    }
    await _auth.api!.post('/me/push/subscribe', {'endpoint': sub['endpoint'], 'keys': sub['keys']});
    await refresh();
    return true;
  }

  Future<void> disable() async {
    final endpoint = await platform.pushUnsubscribe();
    if (endpoint != null) {
      try {
        await _auth.api!.post('/me/push/unsubscribe', {'endpoint': endpoint});
      } on ApiException {
        // l'abonnement expiré sera retiré par le serveur au prochain envoi
      }
    }
    await refresh();
  }
}
