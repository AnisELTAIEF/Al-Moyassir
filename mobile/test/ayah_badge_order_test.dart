import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/widgets/quran_text.dart';

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
}
