import 'dart:async';
import 'dart:math' as math;

import 'package:adhan/adhan.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../env.dart';
import 'api_client.dart';
import 'i18n.dart';

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
  String get label => (fr.isEmpty || fr == ar) ? ar : '$ar · $fr';
}

/// Villes tunisiennes d'abord (Tunis = lieu par défaut), puis libyennes, puis quelques repères.
/// Coordonnées du centre-ville (précision de la ville, suffisante pour les horaires).
const kCities = <City>[
  City('تونس', 'Tunis', 36.8065, 10.1815),
  City('صفاقس', 'Sfax', 34.7406, 10.7603),
  City('سوسة', 'Sousse', 35.8256, 10.6084),
  City('المنستير', 'Monastir', 35.7643, 10.8113),
  City('القيروان', 'Kairouan', 35.6781, 10.0963),
  City('بنزرت', 'Bizerte', 37.2744, 9.8739),
  City('قابس', 'Gabès', 33.8815, 10.0982),
  City('نابل', 'Nabeul', 36.4561, 10.7376),
  City('المهدية', 'Mahdia', 35.5047, 11.0622),
  City('جربة', 'Djerba', 33.8756, 10.8576),
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
  City('الجزائر', 'Alger', 36.7538, 3.0588),
  City('إسطنبول', 'Istanbul', 41.0082, 28.9784),
  City('باريس', 'Paris', 48.8566, 2.3522),
  City('لندن', 'Londres', 51.5074, -0.1278),
  City('مونتريال', 'Montréal', 45.5017, -73.5673),
];

/// Méthodes de calcul proposées (clé = nom de l'enum [CalculationMethod]).
const kMethods = <String, String>{
  'tunisia': 'Tunisie (Fajr 18° · ‘Ichâ’ 18°)',
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
        _method = _prefs.getString('pr_method') ?? 'tunisia', // lieu par défaut : Tunis
        _hanafi = _prefs.getBool('pr_hanafi') ?? false,
        _remind = _prefs.getBool('pr_remind') ?? true,
        _source = _prefs.getString('pr_src') ?? (_prefs.containsKey('pr_lat') ? 'manual' : 'default') {
    _recompute();
    _ticker = Timer.periodic(const Duration(seconds: 20), (_) => _recompute());
  }

  final SharedPreferences _prefs;
  double _lat, _lng;
  String _place, _method;
  bool _hanafi, _remind;
  String _source; // 'default' (Tunis), 'gps' (position de l'appareil) ou 'manual' (ville choisie)
  Timer? _ticker;

  /// Lieu par défaut (Tunis), jamais confirmé par l'utilisateur : on propose de le localiser.
  bool get isDefaultPlace => _source == 'default';

  /// Position détectée par l'appareil (et non choisie dans une liste).
  bool get fromDevice => _source == 'gps';

  /// La demande d'autorisation de localisation a déjà été faite une fois (au premier accès).
  bool get askedOnce => _prefs.getBool('pr_asked') ?? false;
  Future<void> markAsked() => _prefs.setBool('pr_asked', true);

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

  /// Ajustement manuel (en minutes, de −15 à +15) ajouté à chaque horaire : pour coller au calendrier de la mosquée.
  int adjustment(Salat s) => _prefs.getInt('pr_adj_${s.name}') ?? 0;

  Future<void> setAdjustment(Salat s, int minutes) async {
    await _prefs.setInt('pr_adj_${s.name}', minutes.clamp(-15, 15));
    _recompute();
  }

  CalculationParameters _params() {
    final p = _method == 'tunisia' ? _tunisia() : _calcMethod.getParameters();
    p.adjustments = PrayerAdjustments(
      fajr: p.adjustments.fajr + adjustment(Salat.fajr),
      sunrise: p.adjustments.sunrise + adjustment(Salat.sunrise),
      dhuhr: p.adjustments.dhuhr + adjustment(Salat.dhuhr),
      asr: p.adjustments.asr + adjustment(Salat.asr),
      maghrib: p.adjustments.maghrib + adjustment(Salat.maghrib),
      isha: p.adjustments.isha + adjustment(Salat.isha),
    );
    p.madhab = _hanafi ? Madhab.hanafi : Madhab.shafi;
    p.highLatitudeRule = HighLatitudeRule.twilight_angle; // villes à haute latitude (Europe du Nord…)
    return p;
  }

  /// Tunisie (calendrier du ministère des Affaires religieuses) : Fajr et ‘Ichâ’ à 18°,
  /// Dhuhr 7 min après le zénith et Maghrib 2 min après le coucher du soleil (marges de précaution).
  static CalculationParameters _tunisia() {
    final p = CalculationMethod.other.getParameters();
    p.fajrAngle = 18;
    p.ishaAngle = 18;
    p.adjustments = PrayerAdjustments(dhuhr: 7, maghrib: 2);
    return p;
  }

  @visibleForTesting
  Map<Salat, DateTime> timesOn(DateTime day) => _compute(day);

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
    await _setLocation(c.lat, c.lng, c.label, source: 'manual');
  }

  /// Recherche une ville/commune par son nom (via le proxy de géocodage de l'API).
  /// Renvoie une liste vide en cas d'échec ; ne lève pas d'exception.
  Future<List<City>> searchPlaces(String query) async {
    final q = query.trim();
    if (q.length < 2 || Env.apiUrl.isEmpty) return const [];
    try {
      final lang = I18n.isAr ? 'ar' : 'fr';
      final r = await ApiClient(Env.apiUrl)
          .public('GET', '/geocode?lang=$lang&q=${Uri.encodeQueryComponent(q)}');
      final list = (r is Map && r['results'] is List) ? r['results'] as List : const [];
      return [
        for (final e in list)
          if (e is Map && e['lat'] is num && e['lng'] is num)
            City(
              _shortName('${e['name'] ?? ''}'),
              '',
              (e['lat'] as num).toDouble(),
              (e['lng'] as num).toDouble(),
            ),
      ];
    } catch (_) {
      return const [];
    }
  }

  /// Garde les premiers éléments du nom complet (ville, région) pour l'affichage.
  static String _shortName(String full) => full.split(',').take(3).map((s) => s.trim()).join(', ');

  Future<void> _setLocation(double lat, double lng, String place, {required String source}) async {
    _lat = lat;
    _lng = lng;
    _place = place;
    _source = source;
    await _prefs.setDouble('pr_lat', lat);
    await _prefs.setDouble('pr_lng', lng);
    await _prefs.setString('pr_place', place);
    await _prefs.setString('pr_src', source);
    _lastAnnounced = null;
    _recompute();
  }

  /// Détecte la position via l'appareil (navigateur ou téléphone). Renvoie null si c'est réussi,
  /// sinon une erreur ([LocationProblem]) dont le message est traduisible.
  ///
  /// Ordre, du plus rapide au plus lent : dernière position connue du téléphone (si récente),
  /// position « réseau » (Wi-Fi / antennes : quelques secondes, précise à quelques centaines de
  /// mètres, largement suffisant pour des horaires de prière), puis GPS.
  Future<LocationProblem?> detectLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return LocationProblem.serviceOff;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.deniedForever) return LocationProblem.blocked;
      if (perm == LocationPermission.denied) return LocationProblem.denied;

      Position? pos;
      if (!kIsWeb) {
        final last = await Geolocator.getLastKnownPosition();
        if (last != null && DateTime.now().difference(last.timestamp) < const Duration(hours: 6)) pos = last;
      }
      pos ??= await _current(LocationAccuracy.medium, const Duration(seconds: 12));
      pos ??= await _current(LocationAccuracy.high, const Duration(seconds: 20));
      if (pos == null && !kIsWeb) pos = await Geolocator.getLastKnownPosition(); // même ancienne
      if (pos == null) return LocationProblem.timeout;

      final name = await reverseName(pos.latitude, pos.longitude) ?? _labelFor(pos.latitude, pos.longitude);
      await _setLocation(pos.latitude, pos.longitude, name, source: 'gps');
      return null;
    } catch (_) {
      return LocationProblem.unavailable;
    }
  }

  Future<Position?> _current(LocationAccuracy accuracy, Duration limit) async {
    try {
      return await Geolocator.getCurrentPosition(locationSettings: LocationSettings(accuracy: accuracy, timeLimit: limit));
    } catch (_) {
      return null; // délai dépassé ou position indisponible : on essaie la méthode suivante
    }
  }

  /// Ouvre les réglages adaptés au problème (localisation coupée ou autorisation bloquée).
  Future<void> openSettingsFor(LocationProblem p) async {
    if (kIsWeb) return; // navigateur : l'utilisateur autorise dans la barre d'adresse
    if (p == LocationProblem.serviceOff) {
      await Geolocator.openLocationSettings();
    } else if (p == LocationProblem.blocked) {
      await Geolocator.openAppSettings();
    }
  }

  /// Nom de lieu d'une position (« Monastir, Tunisie ») via le géocodage inverse de l'API.
  Future<String?> reverseName(double lat, double lng) async {
    if (Env.apiUrl.isEmpty) return null;
    try {
      final lang = I18n.isAr ? 'ar' : 'fr';
      final r = await ApiClient(Env.apiUrl).public('GET', '/geocode/reverse?lang=$lang&lat=$lat&lng=$lng');
      final name = r is Map ? r['name'] : null;
      return name is String && name.trim().isNotEmpty ? name.trim() : null;
    } catch (_) {
      return null;
    }
  }

  /// Nomme la position détectée d'après la ville connue la plus proche (sinon « Ma position »).
  /// Les horaires sont toujours calculés avec les coordonnées exactes, pas celles de la ville.
  String _labelFor(double lat, double lng) {
    City? best;
    var bestKm = double.infinity;
    for (final c in kCities) {
      final d = _distanceKm(lat, lng, c.lat, c.lng);
      if (d < bestKm) {
        bestKm = d;
        best = c;
      }
    }
    return (best != null && bestKm < 30) ? best.label : tr('Ma position');
  }

  /// Distance en km (formule de haversine).
  static double _distanceKm(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371.0;
    double rad(double d) => d * math.pi / 180;
    final dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }
}

/// Raisons d'échec de la localisation (message traduisible + action proposée).
enum LocationProblem {
  serviceOff('La localisation est désactivée sur l’appareil. Activez-la, puis réessayez.'),
  denied('Autorisation de localisation refusée. Vous pouvez aussi choisir votre ville.'),
  blocked('La localisation est bloquée pour l’app. Autorisez-la dans les réglages, ou choisissez votre ville.'),
  timeout('Position introuvable pour l’instant (intérieur ?). Réessayez près d’une fenêtre, ou choisissez votre ville.'),
  unavailable('Localisation indisponible. Choisissez votre ville dans la liste.');

  const LocationProblem(this.message);
  final String message;

  /// Un réglage de l'appareil peut régler le problème (bouton « Ouvrir les réglages »).
  bool get hasSettings => this == serviceOff || this == blocked;
}
