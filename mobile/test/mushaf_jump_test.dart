import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/push_service.dart';
import 'package:hifidh_quran/core/quran_repository.dart';
import 'package:hifidh_quran/theme.dart';
import 'package:hifidh_quran/widgets/mushaf_jump.dart';
import 'package:provider/provider.dart';

void main() {
  late QuranRepository repo;
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    repo = await QuranRepository.load();
  });

  /// Ouvre « Aller à » et renvoie ce qu'il a choisi.
  Future<AyahRef? Function()> open(WidgetTester tester) async {
    AyahRef? picked;
    await tester.pumpWidget(Provider<QuranRepository>.value(
      value: repo,
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        home: Builder(builder: (context) => TextButton(
              onPressed: () async => picked = await showMushafJump(context, currentPage: 3),
              child: const Text('go'),
            )),
      ),
    ));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    return () => picked;
  }

  testWidgets('enseignant : une sourate trouvée par son nom sans voyelles, sans tourner les pages', (tester) async {
    final picked = await open(tester);
    await tester.enterText(find.byType(TextField).last, 'الناس');
    await tester.pumpAndSettle();
    expect(find.text(repo.surah(113).name), findsNothing, reason: 'les autres sourates sont filtrées');
    await tester.tap(find.text(repo.surah(114).name));
    await tester.pumpAndSettle();
    expect(picked(), (114, 1));
  });

  testWidgets('numéro de page, puis juz', (tester) async {
    var picked = await open(tester);
    await tester.enterText(find.byType(TextField).first, '600');
    await tester.tap(find.text('Ouvrir'));
    await tester.pumpAndSettle();
    expect(picked(), repo.mushafPages[599]);

    picked = await open(tester);
    await tester.tap(find.text('Juz'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('30'));
    await tester.pumpAndSettle();
    expect(picked(), repo.divisions.juzStart(30));
  });

  test('alerte : identifiant de la notification (texte côté Android, nombre côté web)', () {
    expect(PushAlert.from({'kind': 'review_ayat', 'id': '42', 'title': 't'}).id, 42);
    expect(PushAlert.from({'hifidhPush': 'opened', 'id': 7}).id, 7);
    expect(PushAlert.from({'kind': 'retake_pages'}).id, isNull, reason: 'anciennes alertes : la liste s’ouvre');
  });
}
