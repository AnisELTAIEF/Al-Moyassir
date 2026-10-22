import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/api_client.dart';
import 'package:hifidh_quran/core/auth_service.dart';
import 'package:hifidh_quran/core/models.dart';
import 'package:hifidh_quran/core/quran_repository.dart';
import 'package:hifidh_quran/core/validation_store.dart';
import 'package:hifidh_quran/screens/review_screen.dart';
import 'package:hifidh_quran/widgets/ayah_coloring.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Le « serveur » : enregistre les requêtes reçues et répond avec ce que le test a préparé.
class FakeServer {
  final requests = <http.Request>[];
  http.Response Function(http.Request)? handler;
  MockClient get client => MockClient((req) async {
        requests.add(req);
        return handler!(req);
      });
  Map<String, dynamic> get lastBody => jsonDecode(requests.last.body) as Map<String, dynamic>;
}

http.Response json(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

Future<(AuthService, FakeServer)> setup() async {
  SharedPreferences.setMockInitialValues({});
  final auth = AuthService(await SharedPreferences.getInstance());
  final server = FakeServer();
  auth.api = ApiClient('https://x.test', client: server.client)..accessToken = 'a';
  auth.user = const AppUser('u1', 'parent@x.io', 'Parent', 'user');
  return (auth, server);
}

const student = StudentRef(id: 'p1', fullName: 'عبد الله', fatherName: 'محمد', classes: ['فوج 1']);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('séance de validation (enseignant)', () {
    late QuranRepository repo;
    setUpAll(() async => repo = await QuranRepository.load());

    test('chargement : résultats, pages à reprendre, seuil', () async {
      final (auth, server) = await setup();
      server.handler = (_) => json({
            'items': [
              {'surah': 2, 'ayah': 5, 'result': 'acquired', 'at': '2026-10-18T10:00:00Z'},
              {'surah': 2, 'ayah': 6, 'result': 'acquired_error', 'at': '2026-10-18T10:00:00Z'},
            ],
            'retakePages': [3],
            'threshold': 4,
          });
      final s = ValidationSession(auth, repo, orgId: 'o1', student: student);
      await s.load();
      expect(s.of(2, 5), ValResult.acquired);
      expect(s.of(2, 6), ValResult.acquiredError);
      expect(s.of(2, 7), isNull);
      expect(s.isRetake(3), isTrue);
      expect(s.threshold, 4);
      expect(s.validated, 2);
      expect(server.requests.single.url.path, '/orgs/o1/students/p1/validation');
    });

    test('un toucher fait tourner : acquis → avec erreur → à revoir → effacé', () async {
      final (auth, server) = await setup();
      server.handler = (_) => json({'changed': 1, 'retakePages': <int>[], 'threshold': 3});
      final s = ValidationSession(auth, repo, orgId: 'o1', student: student);
      final seen = <ValResult?>[];
      final sent = <String>[];
      for (var i = 0; i < 4; i++) {
        expect(await s.cycle(2, 5), isNull);
        seen.add(s.of(2, 5));
        sent.add(((server.lastBody['items'] as List).single as Map)['result'] as String);
      }
      expect(seen, [ValResult.acquired, ValResult.acquiredError, ValResult.review, null]);
      expect(sent, ['acquired', 'acquired_error', 'review', 'cleared']);
      expect(server.requests.every((r) => r.method == 'PUT'), isTrue);
    });

    test('le serveur refuse : l’affichage revient à l’état d’avant et le message est rendu', () async {
      final (auth, server) = await setup();
      server.handler = (_) => json({'error': 'student_left', 'message': 'Cet élève est sorti de l’établissement.'}, 409);
      final s = ValidationSession(auth, repo, orgId: 'o1', student: student);
      final err = await s.cycle(2, 5);
      expect(err, contains('sorti'));
      expect(s.of(2, 5), isNull, reason: 'rien ne reste affiché si le serveur a refusé');
    });

    test('page entière : tous ses ayat changent ; un refus rétablit les résultats précédents', () async {
      final (auth, server) = await setup();
      final s = ValidationSession(auth, repo, orgId: 'o1', student: student);
      final refs = repo.ayahsOfMushafPage(3);
      expect(refs.length, 11);

      server.handler = (_) => json({'changed': 11, 'retakePages': <int>[], 'threshold': 3});
      expect(await s.setPage(3, ValResult.acquired), isNull);
      expect(server.lastBody, {'page': 3, 'result': 'acquired'});
      expect(refs.every((r) => s.of(r.$1, r.$2) == ValResult.acquired), isTrue);
      expect(s.pageComplete(3), isTrue);

      // Un ayah « à revoir » : la page n'est plus complète.
      await s.cycle(refs[0].$1, refs[0].$2); // acquis → avec erreur
      await s.cycle(refs[0].$1, refs[0].$2); // → à revoir
      expect(s.of(refs[0].$1, refs[0].$2), ValResult.review);
      expect(s.pageComplete(3), isFalse);

      // Effacer la page est refusé par le serveur : on revient à l'état d'avant (acquis + 1 à revoir).
      server.handler = (_) => json({'error': 'forbidden', 'message': 'Action réservée.'}, 403);
      expect(await s.setPage(3, null), contains('réservée'));
      expect(s.of(refs[0].$1, refs[0].$2), ValResult.review);
      expect(s.of(refs[1].$1, refs[1].$2), ValResult.acquired);
    });
  });

  group('validations de l’élève', () {
    test('plusieurs établissements : la validation la plus récente l’emporte, les pages à reprendre s’additionnent (D19)', () async {
      final (auth, server) = await setup();
      server.handler = (req) => req.url.path == '/me/notifications'
          ? json({'unread': 0, 'notifications': <Object>[]})
          : json({
              'organizations': [
                {
                  'organizationId': 'o1',
                  'items': [
                    {'surah': 2, 'ayah': 5, 'result': 'acquired', 'at': '2026-10-01T10:00:00Z'},
                    {'surah': 2, 'ayah': 6, 'result': 'review', 'at': '2026-10-05T10:00:00Z'},
                  ],
                  'retakePages': [3],
                },
                {
                  'organizationId': 'o2',
                  'items': [
                    {'surah': 2, 'ayah': 5, 'result': 'review', 'at': '2026-10-10T10:00:00Z'}, // plus récent
                    {'surah': 2, 'ayah': 6, 'result': 'acquired', 'at': '2026-10-02T10:00:00Z'}, // plus ancien
                  ],
                  'retakePages': [9],
                },
              ],
            });
      final v = ValidationStore(auth);
      await v.refresh();
      expect(v.of(2, 5), ValResult.review, reason: 'o2 est plus récent');
      expect(v.of(2, 6), ValResult.review, reason: 'o1 est plus récent');
      expect(v.isRetake(3) && v.isRetake(9), isTrue);
      expect(v.hasAny, isTrue);
      // « Réviser » : ce que l'enseignant demande, dans l'ordre du Coran.
      expect(v.reviewAyat, [(2, 5), (2, 6)]);
      expect(v.retakePages, [3, 9]);
      expect(passagesOfRefs(v.reviewAyat), [(2, 5, 6)], reason: 'ayat consécutifs : un seul passage');
    });

    test('passages de l’enseignant : coupés entre sourates et aux trous', () {
      expect(passagesOfRefs([(2, 5), (2, 6), (2, 8), (3, 1)]), [(2, 5, 6), (2, 8, 8), (3, 1, 1)]);
      expect(passagesOfRefs([]), isEmpty);
    });

    test('parent relié à plusieurs enfants : on choisit l’enfant, ses validations ne se mélangent pas à celles de l’autre', () async {
      final (auth, server) = await setup();
      server.handler = (req) => req.url.path == '/me/notifications'
          ? json({'unread': 0, 'notifications': <Object>[]})
          : json({
              'organizations': [
                {'organizationId': 'o1', 'studentName': 'ليلى', 'items': [{'surah': 2, 'ayah': 5, 'result': 'acquired', 'at': '2026-10-01T10:00:00Z'}], 'retakePages': [3]},
                {'organizationId': 'o1', 'studentName': 'يوسف', 'items': [{'surah': 2, 'ayah': 6, 'result': 'review', 'at': '2026-10-01T10:00:00Z'}], 'retakePages': <int>[]},
              ],
            });
      final v = ValidationStore(auth);
      await v.refresh();
      expect(v.children, ['ليلى', 'يوسف']..sort());
      final first = v.child!;
      v.selectChild('يوسف');
      expect(v.of(2, 6), ValResult.review);
      expect(v.of(2, 5), isNull, reason: 'validation de l’autre enfant');
      expect(v.isRetake(3), isFalse);
      v.selectChild('ليلى');
      expect(v.of(2, 5), ValResult.acquired);
      expect(v.of(2, 6), isNull);
      expect(v.isRetake(3), isTrue);
      expect(first, isNotEmpty);
    });

    test('classement : sa position dans chaque classe et dans l’association, rien s’il est seul', () async {
      final (auth, server) = await setup();
      server.handler = (req) => req.url.path == '/me/notifications'
          ? json({'unread': 0, 'notifications': <Object>[]})
          : json({'organizations': [
              {'organizationId': 'o1', 'organizationName': 'جمعية', 'studentName': 'ليلى', 'items': <Object>[], 'retakePages': <int>[], 'standing': {
                'association': {'rank': 4, 'of': 23},
                'classes': [{'name': 'فوج 1', 'rank': 1, 'of': 9}, {'name': 'فوج 2', 'rank': null, 'of': 1}],
              }},
            ]});
      final v = ValidationStore(auth);
      await v.refresh();
      final list = v.standings(classLabel: 'Classe', orgLabel: 'Association');
      expect(list.map((r) => (r.label, r.rank, r.of)), [('Classe فوج 1', 1, 9), ('Association جمعية', 4, 23)]);
    });

    test('hors ligne : on garde ce qu’on avait ; déconnexion : tout est vidé', () async {
      final (auth, server) = await setup();
      server.handler = (req) => req.url.path == '/me/notifications'
          ? json({'unread': 2, 'notifications': [
              {'id': 1, 'kind': 'retake_pages', 'payload': {'pages': [3], 'organizationName': 'X'}, 'createdAt': '2026-10-18T10:00:00Z', 'read': false},
              {'id': 2, 'kind': 'review_ayat', 'payload': {'count': 2}, 'createdAt': '2026-10-18T11:00:00Z', 'read': false},
            ]})
          : json({'organizations': [{'organizationId': 'o1', 'items': [{'surah': 2, 'ayah': 5, 'result': 'acquired', 'at': '2026-10-01T10:00:00Z'}], 'retakePages': <int>[]}]});
      final v = ValidationStore(auth);
      await v.refresh();
      expect(v.unread, 2);
      expect(v.notifications.map((n) => n.kind), ['retake_pages', 'review_ayat']);

      server.handler = (_) => throw const FormatException('réseau coupé');
      await v.refresh();
      expect(v.of(2, 5), ValResult.acquired, reason: 'hors ligne : état conservé');
      expect(v.unread, 2);

      auth.user = null;
      await v.refresh();
      expect(v.hasAny, isFalse);
      expect(v.unread, 0);
      expect(v.notifications, isEmpty);
    });

    test('une alerte arrivée pendant un chargement relance un chargement juste après', () async {
      final (auth, server) = await setup();
      var unread = 0;
      server.handler = (req) => req.url.path == '/me/notifications'
          ? json({'unread': unread, 'notifications': <Object>[]})
          : json({'organizations': <Object>[]});
      final v = ValidationStore(auth);
      final first = v.refresh();
      unread = 1; // nouvelle notification côté serveur pendant le premier chargement
      await v.refresh();
      await first;
      expect(v.unread, 1);
      expect(server.requests.length, 4, reason: 'deux chargements, pas plus');
    });

    test('tout marquer comme lu', () async {
      final (auth, server) = await setup();
      server.handler = (req) => req.method == 'POST'
          ? json({'ok': true})
          : req.url.path == '/me/notifications'
              ? json({'unread': 1, 'notifications': [
                  {'id': 7, 'kind': 'review_ayat', 'payload': {'count': 1}, 'createdAt': '2026-10-18T11:00:00Z', 'read': false},
                ]})
              : json({'organizations': <Object>[]});
      final v = ValidationStore(auth);
      await v.refresh();
      expect(v.unread, 1);
      await v.markRead();
      expect(v.unread, 0);
      expect(v.notifications.single.read, isTrue);
    });
  });

  group('couleurs de la validation', () {
    for (final b in Brightness.values) {
      for (final cb in [false, true]) {
        test('${b.name}, daltonisme=$cb : trois résultats distincts entre eux et du papier', () {
          final paper = b == Brightness.dark ? const Color(0xFF0F1615) : const Color(0xFFF5F6F2);
          final bg = [for (final r in ValResult.values) validationBackground(r, paper: paper, brightness: b, colorBlind: cb)!];
          expect(bg.toSet().length, 3, reason: 'acquis, avec erreur et à revoir doivent se distinguer');
          expect(bg.every((c) => c != paper), isTrue);
          expect(validationBackground(null, paper: paper, brightness: b, colorBlind: cb), isNull, reason: 'non validé : fond neutre');
        });
      }
    }
  });
}
