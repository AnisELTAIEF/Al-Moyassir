import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

/// Cache des récitations pour l'écoute hors ligne (usage personnel).
///
/// Un fichier mp3 par (récitateur, sourate), nommé `<reciterId>__<sss>.mp3`.
/// Le téléchargement est à l'initiative de l'utilisateur, sourate par sourate :
/// pas de téléchargement de masse (chaque enregistrement appartient à son
/// éditeur ; la redistribution n'est pas autorisée).
class AudioCache extends ChangeNotifier {
  Directory? _dir;
  int _totalBytes = 0;
  final Map<String, int> _sizes = {}; // clé -> taille des fichiers complets
  final Map<String, double> _downloading = {}; // clé -> progression 0..1

  bool get ready => _dir != null;
  int get totalBytes => _totalBytes;
  int get count => _sizes.length;

  String _key(String reciterId, int surah) => '${reciterId}__${surah.toString().padLeft(3, '0')}';
  File _fileFor(String key) => File('${_dir!.path}/$key.mp3');

  /// À appeler une fois au démarrage (crée le dossier et indexe l'existant).
  Future<void> init() async {
    final base = await getApplicationSupportDirectory();
    final dir = Directory('${base.path}/audio_cache');
    if (!await dir.exists()) await dir.create(recursive: true);
    _dir = dir;
    await _reindex();
  }

  Future<void> _reindex() async {
    _sizes.clear();
    var total = 0;
    if (_dir != null && await _dir!.exists()) {
      await for (final e in _dir!.list()) {
        if (e is File && e.path.endsWith('.mp3')) {
          final name = e.uri.pathSegments.last;
          final key = name.substring(0, name.length - 4);
          final len = await e.length();
          _sizes[key] = len;
          total += len;
        }
      }
    }
    _totalBytes = total;
    notifyListeners();
  }

  bool isCached(String reciterId, int surah) => _sizes.containsKey(_key(reciterId, surah));
  bool isDownloading(String reciterId, int surah) => _downloading.containsKey(_key(reciterId, surah));

  /// Progression d'un téléchargement en cours (0..1), ou null si inconnue/absente.
  double? progress(String reciterId, int surah) => _downloading[_key(reciterId, surah)];

  /// Chemin local du fichier complet, ou null s'il n'est pas en cache.
  String? cachedPath(String reciterId, int surah) {
    if (_dir == null || !isCached(reciterId, surah)) return null;
    return _fileFor(_key(reciterId, surah)).path;
  }

  /// Télécharge une sourate pour l'écoute hors ligne. Écriture atomique
  /// (fichier `.part` renommé une fois complet). Relève l'erreur en cas d'échec.
  Future<void> download(String reciterId, int surah, Uri url) async {
    if (_dir == null) return;
    final key = _key(reciterId, surah);
    if (_sizes.containsKey(key) || _downloading.containsKey(key)) return;
    _downloading[key] = 0;
    notifyListeners();
    final tmp = File('${_dir!.path}/$key.part');
    final client = http.Client();
    try {
      final resp = await client.send(http.Request('GET', url));
      if (resp.statusCode != 200) throw HttpException('HTTP ${resp.statusCode}', uri: url);
      final total = resp.contentLength ?? 0;
      var received = 0;
      var lastPct = -1;
      final sink = tmp.openWrite();
      try {
        await for (final chunk in resp.stream) {
          sink.add(chunk);
          received += chunk.length;
          if (total > 0) {
            final pct = (received * 100 ~/ total);
            if (pct != lastPct) {
              lastPct = pct;
              _downloading[key] = received / total;
              notifyListeners();
            }
          }
        }
      } finally {
        await sink.close();
      }
      final dest = _fileFor(key);
      await tmp.rename(dest.path);
      _sizes[key] = await dest.length();
      _totalBytes += _sizes[key]!;
    } finally {
      client.close();
      if (await tmp.exists()) {
        try {
          await tmp.delete();
        } catch (_) {
          // fichier partiel résiduel : sans gravité
        }
      }
      _downloading.remove(key);
      notifyListeners();
    }
  }

  /// Supprime une sourate téléchargée.
  Future<void> remove(String reciterId, int surah) async {
    final key = _key(reciterId, surah);
    final f = _fileFor(key);
    if (await f.exists()) await f.delete();
    _totalBytes -= _sizes.remove(key) ?? 0;
    if (_totalBytes < 0) _totalBytes = 0;
    notifyListeners();
  }

  /// Vide tout le cache audio.
  Future<void> clear() async {
    if (_dir == null) return;
    await for (final e in _dir!.list()) {
      if (e is File) {
        try {
          await e.delete();
        } catch (_) {
          // un fichier verrouillé sera réessayé au prochain vidage
        }
      }
    }
    _sizes.clear();
    _totalBytes = 0;
    notifyListeners();
  }
}
