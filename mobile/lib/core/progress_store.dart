import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_service.dart';
import 'models.dart';
import 'i18n.dart';

/// Ayat suivis par l'utilisateur (en cours d'apprentissage / appris).
///
/// Local d'abord : tout est enregistré sur l'appareil (une clé par compte) puis
/// synchronisé avec le serveur quand l'utilisateur est connecté. Les écritures
/// qui échouent (hors ligne) restent en file d'attente et sont renvoyées.
class ProgressStore extends ChangeNotifier {
  ProgressStore(this._prefs, this._auth);

  final SharedPreferences _prefs;
  final AuthService _auth;

  String _owner = 'local';
  bool _loaded = false;
  final Map<String, AyahProgress> _items = {};
  final Set<String> _dirty = {};
  bool syncing = false;
  String? syncError;

  String get _dataKey => 'progress_v2_$_owner';
  String get _dirtyKey => 'dirty_v2_$_owner';

  Iterable<AyahProgress> get all => _items.values;
  AyahProgress? get(int surah, int ayah) => _items['$surah:$ayah'];
  AyahStatus? statusOf(int surah, int ayah) => get(surah, ayah)?.status;
  int get memorizedCount => _items.values.where((p) => p.status == AyahStatus.memorized).length;
  int get learningCount => _items.values.where((p) => p.status == AyahStatus.learning).length;
  int memorizedIn(int surah) => _items.values.where((p) => p.surah == surah && p.status == AyahStatus.memorized).length;
  int trackedIn(int surah) => _items.values.where((p) => p.surah == surah).length;

  /// Niveau de maîtrise affiché. [includeOverdue] : une révision en retard compte comme « à revoir ».
  Mastery masteryOf(int surah, int ayah, {bool includeOverdue = true, DateTime? now}) {
    final p = get(surah, ayah);
    if (p == null) return Mastery.none;
    if (p.needsReview) return Mastery.review;
    if (p.status == AyahStatus.learning) return Mastery.learning;
    return includeOverdue && p.isDue(now) ? Mastery.review : Mastery.acquired;
  }

  /// Niveau enregistré (sans tenir compte du retard de révision) : c'est lui que fait avancer le toucher.
  Mastery storedMasteryOf(int surah, int ayah) => masteryOf(surah, ayah, includeOverdue: false);

  /// Fait passer un ayah au niveau suivant du cycle et renvoie le nouveau niveau.
  Future<Mastery> cycleMastery(int surah, int ayah) async {
    final next = storedMasteryOf(surah, ayah).next;
    await setMastery(surah, ayah, next);
    return next;
  }

  /// Définit le niveau de maîtrise d'un ayah (« à revoir » = appris + marqué).
  Future<void> setMastery(int surah, int ayah, Mastery m) async {
    final key = '$surah:$ayah';
    final now = DateTime.now();
    if (m == Mastery.none) {
      if (_items.remove(key) == null) return;
    } else {
      final status = m == Mastery.learning ? AyahStatus.learning : AyahStatus.memorized;
      final old = _items[key];
      final base = old != null && old.status == status ? old : _make(surah, ayah, status, now);
      _items[key] = base.copyWith(needsReview: m == Mastery.review, updatedAt: now);
    }
    _dirty.add(key);
    _persist();
    notifyListeners();
    await _flush();
  }

  /// Nombre d'ayat appris par sourate (index 1..114).
  List<int> memorizedPerSurah() {
    final c = List<int>.filled(115, 0);
    for (final p in _items.values) {
      if (p.status == AyahStatus.memorized) c[p.surah]++;
    }
    return c;
  }

  /// À appeler au démarrage et à chaque changement de compte.
  Future<void> attach(String? userId) async {
    final newOwner = userId ?? 'local';
    if (_loaded && newOwner == _owner) return;
    _loaded = true;
    final previousOwner = _owner;
    _owner = newOwner;
    _load();
    if (userId != null && previousOwner == 'local' && _items.isEmpty) {
      // Première connexion sur cet appareil : on reprend ce qui a été saisi hors compte.
      _owner = 'local';
      _load();
      final local = Map.of(_items);
      _owner = newOwner;
      _items
        ..clear()
        ..addAll(local);
      _dirty
        ..clear()
        ..addAll(local.keys);
      _persist();
    }
    notifyListeners();
    if (userId != null) await sync();
  }

  void _load() {
    _items.clear();
    _dirty.clear();
    final raw = _prefs.getString(_dataKey);
    if (raw != null) {
      for (final j in jsonDecode(raw) as List) {
        final p = AyahProgress.fromJson(j as Map<String, dynamic>);
        _items[p.key] = p;
      }
    }
    _dirty.addAll(_prefs.getStringList(_dirtyKey) ?? const []);
  }

  void _persist() {
    _prefs.setString(_dataKey, jsonEncode([for (final p in _items.values) p.toJson()]));
    _prefs.setStringList(_dirtyKey, _dirty.toList());
  }

  AyahProgress _make(int surah, int ayah, AyahStatus status, DateTime now) {
    final old = _items['$surah:$ayah'];
    return AyahProgress(
      surah: surah,
      ayah: ayah,
      status: status,
      memorizedAt: status == AyahStatus.memorized ? (old?.memorizedAt ?? now) : null,
      lastReviewedAt: old?.lastReviewedAt,
      reviewCount: old?.reviewCount ?? 0,
      updatedAt: now,
    );
  }

  /// Définit l'état d'un ayah ; `null` le retire du suivi.
  Future<void> setStatus(int surah, int ayah, AyahStatus? status) => setRange(surah, [ayah], status);

  /// Définit l'état de plusieurs ayat d'une sourate en une seule synchronisation.
  Future<void> setRange(int surah, Iterable<int> ayahs, AyahStatus? status) =>
      setAyahs([for (final a in ayahs) (surah, a)], status);

  /// Définit l'état d'ayat de plusieurs sourates (hizb, juz) en une seule synchronisation.
  Future<void> setAyahs(Iterable<(int, int)> refs, AyahStatus? status) async {
    final now = DateTime.now();
    var changed = false;
    for (final (surah, ayah) in refs) {
      final key = '$surah:$ayah';
      if (status == null) {
        if (_items.remove(key) == null) continue;
      } else {
        if (_items[key]?.status == status) continue;
        _items[key] = _make(surah, ayah, status, now);
      }
      _dirty.add(key);
      changed = true;
    }
    if (!changed) return; // rien à enregistrer ni à redessiner
    _persist();
    notifyListeners();
    await _flush();
  }

  /// Nombre d'ayat appris / suivis parmi [refs].
  (int memorized, int tracked) countIn(Iterable<(int, int)> refs) {
    var m = 0, t = 0;
    for (final (s, a) in refs) {
      final p = _items['$s:$a'];
      if (p == null) continue;
      t++;
      if (p.status == AyahStatus.memorized) m++;
    }
    return (m, t);
  }

  /// Copie de l'état d'ayat quelconques (pour « Annuler »).
  Map<String, AyahProgress?> snapshotAyahs(Iterable<(int, int)> refs) => {for (final (s, a) in refs) '$s:$a': _items['$s:$a']};

  Future<void> restoreAyahs(Map<String, AyahProgress?> snapshot) async {
    final now = DateTime.now();
    for (final e in snapshot.entries) {
      if (e.value == null) {
        if (_items.remove(e.key) == null) continue;
      } else {
        _items[e.key] = e.value!.copyWith(updatedAt: now);
      }
      _dirty.add(e.key);
    }
    _persist();
    notifyListeners();
    await _flush();
  }

  /// Copie de l'état d'une sourate (pour « Annuler »).
  Map<String, AyahProgress> snapshotSurah(int surah) =>
      {for (final e in _items.entries) if (e.value.surah == surah) e.key: e.value};

  Future<void> restoreSurah(int surah, Map<String, AyahProgress> snapshot) async {
    final now = DateTime.now();
    final keys = {for (final e in _items.entries) if (e.value.surah == surah) e.key, ...snapshot.keys};
    for (final k in keys) {
      final s = snapshot[k];
      if (s == null) {
        _items.remove(k);
      } else {
        _items[k] = s.copyWith(updatedAt: now);
      }
      _dirty.add(k);
    }
    _persist();
    notifyListeners();
    await _flush();
  }

  /// Enregistre une révision d'un ayah déjà appris.
  Future<void> markReviewed(int surah, int ayah) async {
    final key = '$surah:$ayah';
    final old = _items[key];
    if (old == null) return;
    final now = DateTime.now();
    _items[key] = old.copyWith(lastReviewedAt: now, reviewCount: old.reviewCount + 1, needsReview: false, updatedAt: now);
    _dirty.add(key);
    _persist();
    notifyListeners();
    await _flush();
  }

  /// Envoie les modifications en attente puis rafraîchit depuis le serveur.
  Future<void> sync() async {
    if (!_auth.signedIn || syncing) return;
    syncing = true;
    syncError = null;
    notifyListeners();
    try {
      await _flush(throwOnError: true);
      final remote = await _auth.fetchProgress();
      final keep = {for (final k in _dirty) k: _items[k]};
      _items.clear();
      for (final p in remote) {
        _items[p.key] = p;
      }
      for (final e in keep.entries) {
        if (e.value != null) {
          _items[e.key] = e.value!;
        } else {
          _items.remove(e.key);
        }
      }
      _persist();
    } catch (e) {
      syncError = tr('Synchronisation en attente (pas de connexion).');
      if (kDebugMode) debugPrint('sync error: $e');
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  Future<void> _flush({bool throwOnError = false}) async {
    if (!_auth.signedIn || _dirty.isEmpty) return;
    try {
      final upserts = [for (final k in _dirty) if (_items.containsKey(k)) k];
      for (var i = 0; i < upserts.length; i += 500) {
        final chunk = upserts.sublist(i, i + 500 > upserts.length ? upserts.length : i + 500);
        await _auth.upsertProgress([for (final k in chunk) _items[k]!]);
        _dirty.removeAll(chunk);
      }
      final deletes = [for (final k in _dirty) if (!_items.containsKey(k)) k];
      if (deletes.isNotEmpty) {
        await _auth.deleteProgress([
          for (final k in deletes) (int.parse(k.split(':')[0]), int.parse(k.split(':')[1])),
        ]);
        _dirty.removeAll(deletes);
      }
    } catch (e) {
      if (throwOnError) rethrow; // hors ligne : on réessaiera plus tard
    } finally {
      _persist();
    }
  }
}
