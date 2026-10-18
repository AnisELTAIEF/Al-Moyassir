import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'auth_service.dart';
import 'push_stub.dart' if (dart.library.js_interop) 'push_web.dart' as platform;
import 'push_native_stub.dart' if (dart.library.io) 'push_native.dart' as native_;

/// État des alertes « app fermée » sur cet appareil.
enum PushState {
  /// Pas disponibles ici (navigateur sans Web Push : sur iPhone, installer d'abord l'app sur l'écran d'accueil ; app iOS).
  unsupported,

  /// Le serveur n'a pas de clés : fonction désactivée côté serveur.
  unavailable,

  /// L'utilisateur a refusé (navigateur, ou réglages Android) : il doit réactiver dans les réglages.
  denied,
  off,
  on,
}

/// Active ou désactive les alertes de l'appareil et l'enregistre auprès du serveur :
/// Web Push pour la version web / PWA, Firebase Cloud Messaging pour l'app Android.
class PushService extends ChangeNotifier {
  PushService(this._auth, this._prefs);
  final AuthService _auth;
  final SharedPreferences _prefs;
  PushState state = PushState.unsupported;

  /// App native : compte pour lequel l'utilisateur a activé les alertes sur cet appareil.
  static const _nativeUserKey = 'push_native_user';
  String? _sentToken; // dernier jeton envoyé au serveur (évite de le renvoyer à chaque rafraîchissement)
  StreamSubscription<String>? _tokenRefresh;

  /// Vrai sur l'app Android (alertes natives) ; faux sur le web.
  bool get native => native_.nativePushSupported();

  Future<void> refresh() async {
    if (native) return _refreshNative();
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

  /// À appeler depuis un geste de l'utilisateur (le navigateur, comme Android 13+, demande l'autorisation).
  Future<bool> enable() async {
    if (native) return _enableNative();
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
    if (native) return _disableNative();
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

  // --- App Android (Firebase) ---

  Future<void> _refreshNative() async {
    final enabledFor = _prefs.getString(_nativeUserKey);
    try {
      if (!_auth.signedIn) {
        // Déconnexion : le jeton de l'appareil est invalidé, l'ancien compte ne reçoit plus rien ici.
        if (enabledFor != null) {
          await _prefs.remove(_nativeUserKey);
          _sentToken = null;
          await native_.nativePushDeleteToken();
        }
        state = PushState.unsupported;
      } else {
        final info = await _auth.api!.get('/me/push/key') as Map<String, dynamic>;
        if (info['native'] != true) {
          state = PushState.unavailable;
        } else {
          final permission = await native_.nativePushPermission();
          if (permission == 'denied') {
            state = PushState.denied;
          } else if (enabledFor == _auth.userId && permission == 'granted') {
            await _register(await native_.nativePushToken());
            state = PushState.on;
          } else {
            state = PushState.off;
          }
        }
      }
    } catch (e) {
      // hors ligne, ou Firebase indisponible sur l'appareil : réessayé à la prochaine ouverture
      debugPrint('alertes Android : $e');
      if (state == PushState.unsupported && _auth.signedIn) state = PushState.off;
    }
    notifyListeners();
  }

  Future<bool> _enableNative() async {
    final token = await native_.nativePushToken(ask: true);
    if (token == null) {
      await refresh();
      return false;
    }
    _sentToken = null;
    await _register(token);
    await _prefs.setString(_nativeUserKey, _auth.userId!);
    await refresh();
    return true;
  }

  Future<void> _disableNative() async {
    final token = _sentToken ?? await native_.nativePushToken();
    await _prefs.remove(_nativeUserKey);
    _sentToken = null;
    if (token != null) {
      try {
        await _auth.api!.post('/me/push/fcm/remove', {'token': token});
      } on ApiException {
        // le jeton supprimé ci-dessous sera refusé par Firebase, puis oublié par le serveur
      }
    }
    await native_.nativePushDeleteToken();
    await refresh();
  }

  Future<void> _register(String? token) async {
    if (token == null || token == _sentToken) return;
    await _auth.api!.post('/me/push/fcm', {'token': token, 'platform': 'android'});
    _sentToken = token;
    _tokenRefresh ??= (await native_.nativePushTokenRefresh()).listen((t) {
      if (_auth.signedIn && _prefs.getString(_nativeUserKey) == _auth.userId) {
        _register(t).catchError((Object e) => debugPrint('alertes Android : $e'));
      }
    });
  }

  @override
  void dispose() {
    _tokenRefresh?.cancel();
    super.dispose();
  }
}
