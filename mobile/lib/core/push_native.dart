// Alertes natives de l'app Android : Firebase Cloud Messaging (configuration : android/app/google-services.json).
// iOS n'a pas encore de projet Firebase (GoogleService-Info.plist) : seule l'app Android est concernée.
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

bool nativePushSupported() => Platform.isAndroid;

Future<FirebaseMessaging> _messaging() async {
  if (Firebase.apps.isEmpty) await Firebase.initializeApp();
  return FirebaseMessaging.instance;
}

/// 'granted', 'denied' ou 'default' (pas encore demandé : Android 13 et plus).
Future<String> nativePushPermission() async {
  final s = await (await _messaging()).getNotificationSettings();
  return switch (s.authorizationStatus) {
    AuthorizationStatus.authorized || AuthorizationStatus.provisional => 'granted',
    AuthorizationStatus.denied || AuthorizationStatus.deniedPermanently => 'denied',
    AuthorizationStatus.notDetermined => 'default',
  };
}

/// Fenêtre d'autorisation des notifications (Android 13+) ; vrai si accordée.
Future<bool> nativePushRequestPermission() async {
  final s = await (await _messaging()).requestPermission();
  return s.authorizationStatus == AuthorizationStatus.authorized || s.authorizationStatus == AuthorizationStatus.provisional;
}

/// Demande l'autorisation (fenêtre Android 13+) puis renvoie le jeton de l'appareil, ou null si refusé.
Future<String?> nativePushToken({bool ask = false}) async {
  final m = await _messaging();
  if (ask) {
    final s = await m.requestPermission();
    if (s.authorizationStatus != AuthorizationStatus.authorized && s.authorizationStatus != AuthorizationStatus.provisional) return null;
  }
  return m.getToken();
}

Future<void> nativePushDeleteToken() async => (await _messaging()).deleteToken();

/// Nouveau jeton attribué par Firebase (rare) : à renvoyer au serveur.
Future<Stream<String>> nativePushTokenRefresh() async => (await _messaging()).onTokenRefresh;

/// Contenu d'une alerte : `kind`, `id` (notification à ouvrir), `title`, `body`.
Map<String, String> _content(RemoteMessage m) => {
      for (final e in m.data.entries) e.key: '${e.value}',
      if (m.notification?.title != null) 'title': m.notification!.title!,
      if (m.notification?.body != null) 'body': m.notification!.body!,
    };

/// [onReceived] : alerte arrivée app ouverte (Android ne l'affiche pas lui-même) ;
/// [onOpened] : alerte touchée, app en arrière-plan ou fermée (dans ce cas, au démarrage).
Future<void> nativePushListen({
  required void Function(Map<String, String>) onReceived,
  required void Function(Map<String, String>) onOpened,
}) async {
  final m = await _messaging();
  FirebaseMessaging.onMessage.listen((r) => onReceived(_content(r)));
  FirebaseMessaging.onMessageOpenedApp.listen((r) => onOpened(_content(r)));
  final initial = await m.getInitialMessage();
  if (initial != null) onOpened(_content(initial));
}
