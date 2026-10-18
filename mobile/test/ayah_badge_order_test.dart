import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/auth_service.dart';
import 'package:hifidh_quran/core/progress_store.dart';
import 'package:hifidh_quran/core/quran_repository.dart';
import 'package:hifidh_quran/theme.dart';
import 'package:hifidh_quran/widgets/khatam.dart';
import 'package:hifidh_quran/widgets/quran_text.dart';
import 'package:shared_preferences/shared_preferences.dart';

ui.TextBox box(double right, double top) => ui.TextBox.fromLTRBD(right - 20, top, right, top + 20, ui.TextDirection.rtl);

void main() {
  test('médaillons remis dans l’ordre de lecture (droite à gauche, haut en bas)', () {
    // Ligne 1 : un médaillon. Ligne 2 : médaillon en début de ligne (à droite) puis un autre au milieu,
    // renvoyés dans le désordre comme le fait le moteur web.
    final l1 = box(150, 10), l2start = box(300, 70), l2mid = box(120, 72);
    expect(rtlReadingOrder([l1, l2mid, l2start]), [l1, l2start, l2mid]);
  });

  test('ordre déjà correct : inchangé', () {
    final boxes = [box(250, 10), box(60, 10), box(280, 70), box(30, 130)];
    expect(rtlReadingOrder(boxes), boxes);
  });

  renderedOrderTests();
}

/// Rendu réel (moteur de texte natif, police du mushaf) : chaque médaillon doit suivre son ayah.
void renderedOrderTests() {
  testWidgets('mushaf : les médaillons sont dans l’ordre de lecture sur chaque ligne (Android aussi)', (tester) async {
    final font = FontLoader('ScheherazadeNew')..addFont(rootBundle.load('assets/fonts/ScheherazadeNew-Regular.ttf'));
    await font.load();
    final repo = (await tester.runAsync(QuranRepository.load))!;
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final store = ProgressStore(prefs, AuthService(prefs));
    tester.view.physicalSize = const Size(360, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    // Al-Fatiha : « ① » et « ② » sur la même ligne — le moteur natif les renvoie inversés.
    for (final (surah, ayahs) in [(1, [1, 2, 3, 4, 5, 6, 7]), (2, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])]) {
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(Brightness.light),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Builder(builder: (context) => Align(
                alignment: Alignment.topCenter,
                child: AyahRunText(
                  textScaler: TextScaler.noScaling,
                  text: TextSpan(
                    style: quranStyle(22, Colors.black),
                    children: ayahRunSpans(context,
                        surah: repo.surah(surah), ayahs: ayahs, div: repo.divisions, fontSize: 22,
                        tajweed: false, store: store, tap: (_) => TapGestureRecognizer()),
                  ),
                ),
              )),
        ),
      ));
      final rects = [for (final e in find.byType(KhatamBadge).evaluate()) tester.getRect(find.byWidget(e.widget))];
      expect(rects.length, ayahs.length);
      for (var i = 1; i < rects.length; i++) {
        final sameLine = (rects[i].center.dy - rects[i - 1].center.dy).abs() < rects[i].height / 2;
        expect(sameLine ? rects[i].right < rects[i - 1].right : rects[i].top > rects[i - 1].top, isTrue,
            reason: 'sourate $surah : le médaillon ${ayahs[i]} doit venir après ${ayahs[i - 1]}');
      }
    }
  });
}
