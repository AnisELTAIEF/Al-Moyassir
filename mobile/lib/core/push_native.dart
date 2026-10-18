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
