import 'package:flutter/foundation.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Garde l'écran allumé tant qu'au moins une raison le demande : la lecture
/// audio en cours ou l'écran de lecture ouvert. Comptage par référence pour que
/// ces deux sources indépendantes ne se neutralisent pas (relâcher une source
/// ne coupe l'écran que si plus personne ne le réclame).
class ScreenWakelock {
  ScreenWakelock._();

  static final Set<Object> _holders = <Object>{};

  /// Demande à garder l'écran allumé au nom de [reason] (idempotent).
  static void acquire(Object reason) {
    final wasEmpty = _holders.isEmpty;
    _holders.add(reason);
    if (wasEmpty) _apply(true);
  }

  /// Relâche la demande de [reason] ; coupe l'écran si c'était la dernière.
  static void release(Object reason) {
    if (_holders.remove(reason) && _holders.isEmpty) _apply(false);
  }

  static void _apply(bool enable) {
    // Fire-and-forget : un échec de plugin ne doit jamais interrompre la lecture.
    WakelockPlus.toggle(enable: enable).catchError((Object e) {
      if (kDebugMode) debugPrint('ScreenWakelock: $e');
    });
  }
}
