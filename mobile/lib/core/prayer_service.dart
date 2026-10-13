import 'dart:async';

import 'package:adhan/adhan.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Les prières (et le lever du soleil) d'une journée.
enum Salat { fajr, sunrise, dhuhr, asr, maghrib, isha }

extension SalatLabel on Salat {
  /// Nom français (translittéré).
  String get fr => switch (this) {
        Salat.fajr => 'Fajr',
        Salat.sunrise => 'Chourouq',
        Salat.dhuhr => 'Dhuhr',
        Salat.asr => 'Asr',
        Salat.maghrib => 'Maghrib',
        Salat.isha => 'Icha',
      };

  /// Nom arabe.
  String get ar => switch (this) {
        Salat.fajr => 'الفجر',
        Salat.sunrise => 'الشروق',
        Salat.dhuhr => 'الظهر',
        Salat.asr => 'العصر',
        Salat.maghrib => 'المغرب',
        Salat.isha => 'العشاء',
      };

  /// Le lever du soleil n'est pas une prière (affiché à titre indicatif, pas de rappel).
  bool get isPrayer => this != Salat.sunrise;
}

/// Ville proposée pour le choix manuel du lieu (repli quand la localisation est refusée).
class City {
  const City(this.ar, this.fr, this.lat, this.lng);
  final String ar, fr;
  final double lat, lng;
  String get label => '$ar · $fr';
}

/// Villes libyennes principales d'abord, puis quelques repères.
const kCities = <City>[
  City('طرابلس', 'Tripoli', 32.8872, 13.1913),
  City('بنغازي', 'Benghazi', 32.1167, 20.0686),
  City('مصراتة', 'Misrata', 32.3754, 15.0925),
  City('الزاوية', 'Zaouïa', 32.7571, 12.7278),
  City('زليتن', 'Zliten', 32.4674, 14.5687),
  City('البيضاء', 'Al Bayda', 32.7627, 21.7551),
  City('سبها', 'Sabha', 27.0377, 14.4283),
  City('درنة', 'Derna', 32.7557, 22.6378),
  City('طبرق', 'Tobrouk', 32.0836, 23.9764),
  City('سرت', 'Syrte', 31.2089, 16.5887),
  City('غدامس', 'Ghadamès', 30.1333, 9.5000),
  City('مكة المكرمة', 'La Mecque', 21.4225, 39.8262),
  City('المدينة المنورة', 'Médine', 24.4686, 39.6142),
  City('القاهرة', 'Le Caire', 30.0444, 31.2357),
  City('تونس', 'Tunis', 36.8065, 10.1815),
  City('الجزائر', 'Alger', 36.7538, 3.0588),
  City('إسطنبول', 'Istanbul', 41.0082, 28.9784),
  City('باريس', 'Paris', 48.8566, 2.3522),
  City('لندن', 'Londres', 51.5074, -0.1278),
  City('مونتريال', 'Montréal', 45.5017, -73.5673),
];

/// Méthodes de calcul proposées (clé = nom de l'enum [CalculationMethod]).
const kMethods = <String, String>{
  'muslim_world_league': 'Ligue islamique mondiale',
  'umm_al_qura': 'Umm al-Qura (La Mecque)',
  'egyptian': 'Autorité générale d’Égypte',
  'turkey': 'Diyanet (Turquie)',
  'karachi': 'Université de Karachi',
  'dubai': 'Dubaï',
  'qatar': 'Qatar',
  'kuwait': 'Koweït',
  'north_america': 'ISNA (Amérique du Nord)',
};

/// Calcule les horaires de prière du lieu choisi, avec la méthode réglée par l'utilisateur.
///
/// Les horaires sont calculés localement (paquet `adhan`), sans réseau : identique sur l'app
/// mobile et sur la version web. La position vient de la localisation de l'appareil (navigateur
/// ou téléphone) ou, à défaut, d'une ville choisie à la main.
class PrayerService extends ChangeNotifier {
  PrayerService(this._prefs)
      : _lat = _prefs.getDouble('pr_lat') ?? kCities.first.lat,
        _lng = _prefs.getDouble('pr_lng') ?? kCities.first.lng,
        _place = _prefs.getString('pr_place') ?? kCities.first.label,
        _method = _prefs.getString('pr_method') ?? 'muslim_world_league',
        _hanafi = _prefs.getBool('pr_hanafi') ?? false,
        _remind = _prefs.getBool('pr_remind') ?? true {
    _recompute();
    _ticker = Timer.periodic(const Duration(seconds: 20), (_) => _recompute());
  }

  final SharedPreferences _prefs;
  double _lat, _lng;
  String _place, _method;
  bool _hanafi, _remind;
  Timer? _ticker;

  Map<Salat, DateTime> _times = const {};
  String? _lastAnnounced; // clé « yyyy-mm-dd:salat » déjà signalée (rappel in-app une seule fois)

  /// Appelé quand une prière arrive alors que l'app est ouverte (rappel in-app, Phase 1).
  void Function(Salat salat)? onDue;

  String get place => _place;
  String get method => _method;
  bool get hanafi => _hanafi;
  bool get remind => _remind;
  double get lat => _lat;
  double get lng => _lng;

  /// Horaires du jour, dans l'ordre.
  Map<Salat, DateTime> get times => _times;

  CalculationMethod get _calcMethod =>
      CalculationMethod.values.asNameMap()[_method] ?? CalculationMethod.muslim_world_league;

  CalculationParameters _params() {
    final p = _calcMethod.getParameters();
    p.madhab = _hanafi ? Madhab.hanafi : Madhab.shafi;
    p.highLatitudeRule = HighLatitudeRule.twilight_angle; // villes à haute latitude (Europe du Nord…)
    return p;
  }

  Map<Salat, DateTime> _compute(DateTime day) {
    final pt = PrayerTimes(Coordinates(_lat, _lng), DateComponents.from(day), _params());
    return {
      Salat.fajr: pt.fajr,
      Salat.sunrise: pt.sunrise,
      Salat.dhuhr: pt.dhuhr,
      Salat.asr: pt.asr,
      Salat.maghrib: pt.maghrib,
      Salat.isha: pt.isha,
    };
  }

  void _recompute() {
    _times = _compute(DateTime.now());
    _checkDue();
    notifyListeners();
  }

  /// Prochaine prière à venir (clé + heure) ; après la 'Icha, le Fajr du lendemain.
  (Salat, DateTime)? get next {
    final now = DateTime.now();
    for (final s in Salat.values) {
      final t = _times[s];
      if (t != null && t.isAfter(now)) return (s, t);
    }
    final tomorrow = _compute(now.add(const Duration(days: 1)));
    final f = tomorrow[Salat.fajr];
    return f == null ? null : (Salat.fajr, f);
  }

  /// Rappel in-app : quand on franchit l'heure d'une prière, app ouverte, on prévient une fois.
  void _checkDue() {
    if (!_remind || onDue == null) return;
    final now = DateTime.now();
    final day = '${now.year}-${now.month}-${now.day}';
    for (final s in Salat.values) {
      if (!s.isPrayer) continue;
      final t = _times[s];
      if (t == null) continue;
      final diff = now.difference(t);
      // Prière franchie dans la dernière minute, non encore signalée aujourd'hui.
      if (diff.inSeconds >= 0 && diff.inSeconds < 90 && _lastAnnounced != '$day:${s.name}') {
        _lastAnnounced = '$day:${s.name}';
        onDue!(s);
      }
    }
  }

  Future<void> setMethod(String m) async {
    _method = m;
    await _prefs.setString('pr_method', m);
    _recompute();
  }

  Future<void> setHanafi(bool v) async {
    _hanafi = v;
    await _prefs.setBool('pr_hanafi', v);
    _recompute();
  }

  Future<void> setRemind(bool v) async {
    _remind = v;
    await _prefs.setBool('pr_remind', v);
    notifyListeners();
  }

  Future<void> setCity(City c) async {
    await _setLocation(c.lat, c.lng, c.label);
  }

  Future<void> _setLocation(double lat, double lng, String place) async {
    _lat = lat;
    _lng = lng;
    _place = place;
    await _prefs.setDouble('pr_lat', lat);
    await _prefs.setDouble('pr_lng', lng);
    await _prefs.setString('pr_place', place);
    _lastAnnounced = null;
    _recompute();
  }

  /// Détecte la position via l'appareil (navigateur ou téléphone). Renvoie un message d'erreur
  /// traduisible (clé) en cas d'échec, sinon null.
  Future<String?> detectLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return 'Activez la localisation de votre appareil, puis réessayez.';
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        return 'Localisation refusée. Choisissez votre ville dans la liste.';
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low),
      );
      await _setLocation(pos.latitude, pos.longitude, 'Ma position');
      return null;
    } catch (_) {
      return 'Localisation indisponible. Choisissez votre ville dans la liste.';
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }
}
