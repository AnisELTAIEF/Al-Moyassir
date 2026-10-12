import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'audio_cache.dart';
import 'models.dart';
import 'quran_repository.dart';
import 'screen_wakelock.dart';
import 'i18n.dart';

enum PlayMode { continuous, singleAyah }

/// Lecture audio d'une sourate (un fichier par sourate) synchronisée ayah par ayah
/// grâce aux minutages embarqués. Permet de répéter un ayah N fois pour la mémorisation.
class AudioController extends ChangeNotifier {
  AudioController(this._repo, this._prefs, this._cache) {
    _reciterId = _prefs.getString('reciter_id') ?? _defaultReciterId;
    _posSub = _player
        .createPositionStream(minPeriod: const Duration(milliseconds: 60), maxPeriod: const Duration(milliseconds: 120))
        .listen(_onPosition);
    _stateSub = _player.playerStateStream.listen(_onState);
  }

  static const _defaultReciterId = 'mp3quran_201_199';
  /// Les débuts d'ayah mesurés arrivent en moyenne ~110 ms trop tard : on démarre un peu avant.
  static const _leadInMs = 350;

  final QuranRepository _repo;
  final SharedPreferences _prefs;
  final AudioCache _cache;
  final AudioPlayer _player = AudioPlayer();
  late final StreamSubscription<Duration> _posSub;
  late final StreamSubscription<PlayerState> _stateSub;

  late String _reciterId;
  int? _surah;
  List<AyahTiming> _timings = const [];
  int? _currentAyah;
  PlayMode _mode = PlayMode.continuous;
  int _repeatTarget = 1; // 0 = infini
  int _repeatsDone = 0;
  bool _loading = false;
  String? _error;
  bool _seeking = false;

  Reciter get reciter => _repo.reciter(_reciterId);
  int? get surah => _surah;
  int? get currentAyah => _currentAyah;
  PlayMode get mode => _mode;
  int get repeatTarget => _repeatTarget;
  int get repeatsDone => _repeatsDone;
  bool get loading => _loading;
  bool get playing => _player.playing;
  String? get error => _error;
  bool get active => _surah != null;

  Future<void> setReciter(String id) async {
    if (id == _reciterId) return;
    final resume = _surah != null && _currentAyah != null ? (_surah!, _currentAyah!, _player.playing) : null;
    _reciterId = id;
    _prefs.setString('reciter_id', id);
    await _player.stop();
    _surah = null;
    _currentAyah = null;
    notifyListeners();
    if (resume != null && reciter.hasSurah(resume.$1)) {
      await play(resume.$1, resume.$2, autoplay: resume.$3);
    }
  }

  void setMode(PlayMode m) {
    _mode = m;
    notifyListeners();
  }

  void setRepeat(int n) {
    _repeatTarget = n;
    _repeatsDone = 0;
    notifyListeners();
  }

  /// Lance (ou saute à) un ayah d'une sourate.
  Future<void> play(int surah, int ayah, {bool autoplay = true}) async {
    _error = null;
    if (!reciter.hasSurah(surah)) {
      _error = tr('Cette sourate n’est pas disponible pour {name}.', {'name': reciter.name});
      notifyListeners();
      return;
    }
    try {
      if (_surah != surah || _timings.isEmpty) {
        _loading = true;
        _surah = surah;
        _timings = await _repo.timingsFor(_reciterId, surah);
        notifyListeners();
        if (_timings.isEmpty) throw StateError(tr('Minutages indisponibles pour cette sourate.'));
        // Hors ligne si la sourate a été téléchargée, sinon streaming.
        final cached = _cache.cachedPath(_reciterId, surah);
        if (cached != null) {
          await _player.setFilePath(cached);
        } else {
          await _player.setUrl(reciter.audioUri(surah).toString());
        }
        _loading = false;
      }
      await _seekToAyah(ayah);
      if (autoplay) {
        unawaited(_player.play());
      }
    } on PlayerException catch (e) {
      _fail(tr('Lecture impossible (connexion ?) : {err}', {'err': e.message ?? e.code}));
    } on PlayerInterruptedException {
      _loading = false;
    } catch (e) {
      _fail('$e');
    }
    notifyListeners();
  }

  void _fail(String msg) {
    _loading = false;
    _error = msg;
    _surah = null;
    _currentAyah = null;
  }

  AyahTiming? _timingOf(int ayah) {
    for (final t in _timings) {
      if (t.ayah == ayah) return t;
    }
    return null;
  }

  Future<void> _seekToAyah(int ayah) async {
    final t = _timingOf(ayah);
    if (t == null) return;
    final prevEnd = ayah > 1 ? (_timingOf(ayah - 1)?.endMs ?? 0) : 0;
    final start = max(prevEnd, t.startMs - _leadInMs);
    _currentAyah = ayah;
    _repeatsDone = 0;
    _seeking = true;
    await _player.seek(Duration(milliseconds: max(0, start)));
    _seeking = false;
  }

  Future<void> toggle() async {
    if (_surah == null) return;
    if (_player.playing) {
      await _player.pause();
    } else {
      if (_player.processingState == ProcessingState.completed && _currentAyah != null) {
        await _seekToAyah(_currentAyah!);
      }
      unawaited(_player.play());
    }
    notifyListeners();
  }

  Future<void> next() async {
    if (_surah == null || _currentAyah == null) return;
    final n = _currentAyah! + 1;
    if (_timingOf(n) != null) await _seekToAyah(n);
    notifyListeners();
  }

  Future<void> previous() async {
    if (_surah == null || _currentAyah == null) return;
    final p = max(1, _currentAyah! - 1);
    await _seekToAyah(p);
    notifyListeners();
  }

  Future<void> stop() async {
    await _player.stop();
    _surah = null;
    _currentAyah = null;
    _timings = const [];
    notifyListeners();
  }

  void _onPosition(Duration pos) {
    if (_surah == null || _timings.isEmpty || _seeking || _currentAyah == null) return;
    final ms = pos.inMilliseconds;
    final cur = _timingOf(_currentAyah!);
    if (cur == null) return;

    if (_mode == PlayMode.singleAyah) {
      if (ms >= cur.endMs) {
        _repeatsDone++;
        if (_repeatTarget == 0 || _repeatsDone < _repeatTarget) {
          final done = _repeatsDone;
          _seekToAyah(cur.ayah).then((_) {
            _repeatsDone = done; // _seekToAyah remet le compteur à 0
            notifyListeners();
          });
        } else {
          _player.pause();
          _repeatsDone = 0;
          notifyListeners();
        }
      }
      return;
    }

    // Mode continu : l'ayah courant suit la position.
    int? found;
    for (final t in _timings) {
      if (ms >= t.startMs - _leadInMs && ms < t.endMs) {
        found = t.ayah;
        break;
      }
    }
    if (found != null && found != _currentAyah) {
      _currentAyah = found;
      notifyListeners();
    }
  }

  void _onState(PlayerState s) {
    if (s.processingState == ProcessingState.completed) {
      _player.pause();
    }
    // Écran allumé pendant que l'audio joue, relâché à la pause/fin.
    if (_player.playing) {
      ScreenWakelock.acquire(this);
    } else {
      ScreenWakelock.release(this);
    }
    notifyListeners();
  }

  @override
  void dispose() {
    ScreenWakelock.release(this);
    _posSub.cancel();
    _stateSub.cancel();
    _player.dispose();
    super.dispose();
  }
}
