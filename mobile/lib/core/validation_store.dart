import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'auth_service.dart';
import 'quran_repository.dart';

/// Résultat posé par l'enseignant sur un ayah.
enum ValResult {
  acquired,
  acquiredError,
  review;

  static ValResult? parse(String? s) => switch (s) {
        'acquired' => acquired,
        'acquired_error' => acquiredError,
        'review' => review,
        _ => null,
      };

  String get api => switch (this) { acquired => 'acquired', acquiredError => 'acquired_error', review => 'review' };

  /// Passage à l'état suivant au toucher de l'enseignant : rien → acquis → acquis avec erreur → à revoir → rien.
  ValResult? get next => switch (this) { acquired => acquiredError, acquiredError => review, review => null };
}

/// Une notification du centre de notifications (le texte est composé par l'app à partir de [kind] et [payload]).
class AppNotification {
  const AppNotification({required this.id, required this.kind, required this.payload, required this.createdAt, required this.read});
  final int id;
  final String kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final bool read;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['id'] as num).toInt(),
        kind: j['kind'] as String,
        payload: (j['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
        read: j['read'] == true,
      );
}

/// Ce que l'enseignant a validé pour CET élève (couche « enseignant » du mushaf) et le centre de notifications.
///
/// Couche privée de l'élève (ses propres marques « à revoir ») : elle vit dans [ProgressStore] et n'est jamais
/// envoyée à l'enseignant. Ici, au contraire, ne figure que ce que l'équipe a posé.
class ValidationStore extends ChangeNotifier implements ValidationView {
  ValidationStore(this._auth);
  final AuthService _auth;

  final Map<String, (ValResult, DateTime)> _items = {};
  Set<int> _retake = {};
  List<AppNotification> _notifications = const [];
  int _unread = 0;

  bool get hasAny => _items.isNotEmpty;
  @override
  ValResult? of(int surah, int ayah) => _items['$surah:$ayah']?.$1;

  /// La page (1..604) est « à reprendre » : trop d'ayat « avec erreur » dessus (seuil de l'association).
  @override
  bool isRetake(int page) => _retake.contains(page);
  int get retakeCount => _retake.length;

  /// Pages à reprendre, dans l'ordre du mushaf.
  List<int> get retakePages => _retake.toList()..sort();

  /// Ayat que l'enseignant a marqués « à revoir » (sourate, ayah), dans l'ordre du Coran.
  List<(int, int)> get reviewAyat {
    final out = <(int, int)>[
      for (final e in _items.entries)
        if (e.value.$1 == ValResult.review) (int.parse(e.key.split(':')[0]), int.parse(e.key.split(':')[1])),
    ];
    return out..sort((a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
  }
  List<AppNotification> get notifications => _notifications;
  int get unread => _unread;

  void clear() {
    if (_items.isEmpty && _retake.isEmpty && _notifications.isEmpty && _unread == 0) return;
    _items.clear();
    _retake = {};
    _notifications = const [];
    _unread = 0;
    notifyListeners();
  }

  /// Recharge depuis le serveur. Silencieux en cas d'échec (hors ligne) : on garde ce qu'on avait.
  bool _refreshing = false;
  bool _again = false;

  Future<void> refresh() async {
    final api = _auth.api;
    if (!_auth.signedIn || api == null) return clear();
    if (_refreshing) {
      // La session notifie souvent : une seule requête à la fois, mais une alerte arrivée pendant
      // le chargement relance un chargement juste après (sinon elle n'apparaîtrait qu'au suivant).
      _again = true;
      return;
    }
    _refreshing = true;
    try {
      final v = await api.get('/me/validations') as Map<String, dynamic>;
      final n = await api.get('/me/notifications') as Map<String, dynamic>;
      final items = <String, (ValResult, DateTime)>{};
      final retake = <int>{};
      for (final o in (v['organizations'] as List? ?? const [])) {
        final org = o as Map<String, dynamic>;
        retake.addAll([for (final p in (org['retakePages'] as List? ?? const [])) (p as num).toInt()]);
        for (final i in (org['items'] as List? ?? const [])) {
          final m = i as Map<String, dynamic>;
          final r = ValResult.parse(m['result'] as String?);
          if (r == null) continue;
          final at = DateTime.tryParse(m['at'] as String? ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);
          final key = '${m['surah']}:${m['ayah']}';
          // Plusieurs établissements : pour chaque ayah, la validation la plus récente l'emporte.
          final prev = items[key];
          if (prev == null || at.isAfter(prev.$2)) items[key] = (r, at);
        }
      }
      _items
        ..clear()
        ..addAll(items);
      _retake = retake;
      _notifications = [for (final x in (n['notifications'] as List? ?? const [])) AppNotification.fromJson(x as Map<String, dynamic>)];
      _unread = (n['unread'] as num?)?.toInt() ?? 0;
      notifyListeners();
    } on ApiException {
      // hors ligne ou session expirée : on garde l'état courant.
    } finally {
      _refreshing = false;
      if (_again) {
        _again = false;
        await refresh();
      }
    }
  }

  /// Marque comme lues (toutes, ou celles données).
  Future<void> markRead([List<int>? ids]) async {
    final api = _auth.api;
    if (api == null) return;
    try {
      await api.post('/me/notifications/read', ids == null ? <String, dynamic>{} : {'ids': ids});
      _notifications = [for (final n in _notifications) (ids == null || ids.contains(n.id)) ? AppNotification(id: n.id, kind: n.kind, payload: n.payload, createdAt: n.createdAt, read: true) : n];
      _unread = _notifications.where((n) => !n.read).length;
      notifyListeners();
    } on ApiException {
      // sans conséquence : la prochaine ouverture réessaiera.
    }
  }
}

/// Ce que le mushaf a besoin de savoir des validations : celles de l'élève (lecture) ou d'une séance de l'enseignant.
abstract interface class ValidationView {
  ValResult? of(int surah, int ayah);
  bool isRetake(int page);
}

/// Un élève d'un établissement, tel que l'enseignant le voit dans sa liste.
class StudentRef {
  const StudentRef({required this.id, required this.fullName, required this.fatherName, required this.classes, this.age});
  final String id, fullName, fatherName;
  final List<String> classes;
  final int? age;

  factory StudentRef.fromJson(Map<String, dynamic> j) => StudentRef(
        id: j['id'] as String,
        fullName: j['fullName'] as String,
        fatherName: (j['fatherName'] as String?) ?? '',
        classes: [for (final c in (j['classes'] as List? ?? const [])) (c as Map<String, dynamic>)['name'] as String],
        age: (j['age'] as num?)?.toInt(),
      );
}

/// Séance de validation d'un élève par un enseignant : état courant + envoi des modifications.
/// Les modifications sont affichées tout de suite, puis annulées si le serveur les refuse.
class ValidationSession extends ChangeNotifier implements ValidationView {
  ValidationSession(this._auth, this._repo, {required this.orgId, required this.student});
  final AuthService _auth;
  final QuranRepository _repo;
  final String orgId;
  final StudentRef student;

  final Map<String, ValResult> _items = {};
  Set<int> _retake = {};
  int threshold = 3;
  bool loading = true;
  String? error;

  @override
  ValResult? of(int surah, int ayah) => _items['$surah:$ayah'];
  @override
  bool isRetake(int page) => _retake.contains(page);
  int get validated => _items.length;

  String get _base => '/orgs/$orgId/students/${student.id}/validation';

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final r = await _auth.api!.get(_base) as Map<String, dynamic>;
      _items.clear();
      for (final i in (r['items'] as List)) {
        final m = i as Map<String, dynamic>;
        final res = ValResult.parse(m['result'] as String?);
        if (res != null) _items['${m['surah']}:${m['ayah']}'] = res;
      }
      _retake = {for (final p in (r['retakePages'] as List)) (p as num).toInt()};
      threshold = (r['threshold'] as num?)?.toInt() ?? 3;
    } on ApiException catch (e) {
      error = e.message;
    }
    loading = false;
    notifyListeners();
  }

  /// Envoie des changements ; renvoie un message d'erreur si le serveur refuse (l'affichage est alors rétabli).
  Future<String?> _send(Map<String, dynamic> body, void Function() applyLocally, void Function() undo) async {
    applyLocally();
    notifyListeners();
    try {
      final r = await _auth.api!.put(_base, body) as Map<String, dynamic>;
      _retake = {for (final p in (r['retakePages'] as List)) (p as num).toInt()};
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      undo();
      notifyListeners();
      return e.message;
    }
  }

  /// Un toucher sur un ayah : passe au résultat suivant (rien → acquis → avec erreur → à revoir → rien).
  Future<String?> cycle(int surah, int ayah) {
    final key = '$surah:$ayah';
    final before = _items[key];
    final next = before == null ? ValResult.acquired : before.next;
    return _send(
      {'items': [{'surah': surah, 'ayah': ayah, 'result': next?.api ?? 'cleared'}]},
      () => next == null ? _items.remove(key) : _items[key] = next,
      () => before == null ? _items.remove(key) : _items[key] = before,
    );
  }

  /// Applique un résultat (ou l'efface si [result] est null) à toute une page du mushaf.
  Future<String?> setPage(int page, ValResult? result) {
    final refs = _repo.ayahsOfMushafPage(page);
    final before = {for (final r in refs) '${r.$1}:${r.$2}': _items['${r.$1}:${r.$2}']};
    return _send(
      {'page': page, 'result': result?.api ?? 'cleared'},
      () {
        for (final k in before.keys) {
          result == null ? _items.remove(k) : _items[k] = result;
        }
      },
      () {
        before.forEach((k, v) => v == null ? _items.remove(k) : _items[k] = v);
      },
    );
  }

  /// Statut de la page tel que l'enseignant la voit : tous acquis ?
  bool pageComplete(int page) => _repo.ayahsOfMushafPage(page).every((r) => _items['${r.$1}:${r.$2}'] != null && _items['${r.$1}:${r.$2}'] != ValResult.review);
}
