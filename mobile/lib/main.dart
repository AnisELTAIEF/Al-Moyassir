import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/audio_cache.dart';
import 'core/audio_controller.dart';
import 'core/auth_service.dart';
import 'core/prayer_service.dart';
import 'core/progress_store.dart';
import 'core/quran_repository.dart';
import 'core/settings.dart';
import 'core/validation_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final repo = await QuranRepository.load();
  final auth = AuthService(prefs);
  final progress = ProgressStore(prefs, auth);
  final settings = Settings(prefs);
  final validations = ValidationStore(auth);
  final audioCache = AudioCache();
  await audioCache.init();
  await progress.attach(null);
  // La session est reprise en arrière-plan : l'app s'ouvre tout de suite, même hors ligne.
  auth.addListener(() {
    settings.owner = auth.userId;
    progress.attach(auth.userId);
    // Validations de l'enseignant et notifications : propres au compte (vidées à la déconnexion).
    validations.refresh();
  });
  auth.restore();

  runApp(MultiProvider(
    providers: [
      Provider<QuranRepository>.value(value: repo),
      ChangeNotifierProvider<AuthService>.value(value: auth),
      ChangeNotifierProvider<ProgressStore>.value(value: progress),
      ChangeNotifierProvider<Settings>.value(value: settings),
      ChangeNotifierProvider<ValidationStore>.value(value: validations),
      ChangeNotifierProvider<PrayerService>(create: (_) => PrayerService(prefs)),
      ChangeNotifierProvider<AudioCache>.value(value: audioCache),
      ChangeNotifierProvider<AudioController>(create: (_) => AudioController(repo, prefs, audioCache)),
    ],
    child: const HifidhApp(),
  ));
}
