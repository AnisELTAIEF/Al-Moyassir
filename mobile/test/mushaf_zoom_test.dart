import 'package:flutter_test/flutter_test.dart';
import 'package:hifidh_quran/core/settings.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('zoom Qira’a : page entière par défaut, +20 % par niveau, borné et mémorisé', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final s = Settings(prefs);
    expect(s.mushafZoom, 0);
    expect(s.mushafZoomFactor, 1.0);
    s.mushafZoom = 2;
    expect(s.mushafZoomFactor, closeTo(1.44, 1e-9));
    s.mushafZoom = 99;
    expect(s.mushafZoom, Settings.mushafZoomMax);
    s.mushafZoom = -3;
    expect(s.mushafZoom, 0);
    s.mushafZoom = 3;
    expect(Settings(prefs).mushafZoom, 3, reason: 'conservé après redémarrage');
  });
}
