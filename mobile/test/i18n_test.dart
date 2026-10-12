import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/i18n.dart';
import 'package:hifidh_quran/core/i18n_ar.dart';

void main() {
  test('chaque texte traduisible du code a sa traduction arabe', () {
    final keys = <String>{};
    final re = RegExp(r"\btr\('((?:[^'\\\n]|\\.)*)'");
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      for (final m in re.allMatches(f.readAsStringSync())) {
        keys.add(m.group(1)!.replaceAll(r'\n', '\n'));
      }
    }
    final missing = keys.where((k) => !arStrings.containsKey(k)).toList();
    expect(missing, isEmpty);
  });

  test('variables et repli sur le français', () {
    I18n.lang = AppLang.ar;
    expect(tr('Hizb {n}', {'n': 3}), 'الحزب 3');
    expect(tr('Texte absent du dictionnaire'), 'Texte absent du dictionnaire');
    for (final e in arStrings.entries) {
      for (final v in RegExp(r'\{(\w+)\}').allMatches(e.key)) {
        expect(e.value, contains('{${v.group(1)}}'), reason: e.key);
      }
    }
    I18n.lang = AppLang.fr;
    expect(tr('Hizb {n}', {'n': 3}), 'Hizb 3');
  });
}
