/// Invocations (du‘â’) adressées à l'utilisateur par son prénom, inspirées du Coran et de la Sunna
/// (formulations écrites pour l'app, sans pronom pour convenir à tous ; ce ne sont pas des
/// citations mot à mot). Sans prénom (visiteur), la forme « nous » est utilisée.
class PersonalDua {
  const PersonalDua({required this.named, required this.plural, required this.frNamed, required this.frPlural});

  /// Arabe avec `{name}`.
  final String named;

  /// Arabe, forme « nous ».
  final String plural;
  final String frNamed, frPlural;
}

const kPersonalDuas = <PersonalDua>[
  PersonalDua(
    named: 'اللَّهُمَّ اجْعَلِ القُرْآنَ الكَرِيمَ رَبِيعَ قَلْبِ {name}',
    plural: 'اللَّهُمَّ اجْعَلِ القُرْآنَ الكَرِيمَ رَبِيعَ قُلُوبِنَا',
    frNamed: 'Ô Allah, fais du Noble Coran le printemps du cœur de {name}.',
    frPlural: 'Ô Allah, fais du Noble Coran le printemps de nos cœurs.',
  ),
  PersonalDua(
    named: 'اللَّهُمَّ يَسِّرْ عَلَى {name} حِفْظَ كِتَابِكَ وَتِلَاوَتَهُ',
    plural: 'اللَّهُمَّ يَسِّرْ عَلَيْنَا حِفْظَ كِتَابِكَ وَتِلَاوَتَهُ',
    frNamed: 'Ô Allah, facilite à {name} la mémorisation et la récitation de Ton Livre.',
    frPlural: 'Ô Allah, facilite-nous la mémorisation et la récitation de Ton Livre.',
  ),
  PersonalDua(
    named: 'اللَّهُمَّ اجْعَلْ {name} مِنْ أَهْلِ القُرْآنِ، أَهْلِكَ وَخَاصَّتِكَ',
    plural: 'اللَّهُمَّ اجْعَلْنَا مِنْ أَهْلِ القُرْآنِ، أَهْلِكَ وَخَاصَّتِكَ',
    frNamed: 'Ô Allah, compte {name} parmi les gens du Coran, Tes proches et Tes élus.',
    frPlural: 'Ô Allah, compte-nous parmi les gens du Coran, Tes proches et Tes élus.',
  ),
  PersonalDua(
    named: 'رَبِّ زِدْ {name} عِلْمًا',
    plural: 'رَبَّنَا زِدْنَا عِلْمًا',
    frNamed: 'Seigneur, accrois {name} en science.',
    frPlural: 'Seigneur, accrois-nous en science.',
  ),
  PersonalDua(
    named: 'اللَّهُمَّ ثَبِّتِ القُرْآنَ فِي صَدْرِ {name}',
    plural: 'اللَّهُمَّ ثَبِّتِ القُرْآنَ فِي صُدُورِنَا',
    frNamed: 'Ô Allah, affermis le Coran dans la poitrine de {name}.',
    frPlural: 'Ô Allah, affermis le Coran dans nos poitrines.',
  ),
  PersonalDua(
    named: 'اللَّهُمَّ ارْزُقْ {name} تِلَاوَةَ كِتَابِكَ آنَاءَ اللَّيْلِ وَأَطْرَافَ النَّهَارِ',
    plural: 'اللَّهُمَّ ارْزُقْنَا تِلَاوَةَ كِتَابِكَ آنَاءَ اللَّيْلِ وَأَطْرَافَ النَّهَارِ',
    frNamed: 'Ô Allah, accorde à {name} de réciter Ton Livre aux heures de la nuit et aux extrémités du jour.',
    frPlural: 'Ô Allah, accorde-nous de réciter Ton Livre aux heures de la nuit et aux extrémités du jour.',
  ),
  PersonalDua(
    named: 'اللَّهُمَّ ارْزُقْ {name} عِلْمًا نَافِعًا وَعَمَلًا صَالِحًا',
    plural: 'اللَّهُمَّ ارْزُقْنَا عِلْمًا نَافِعًا وَعَمَلًا صَالِحًا',
    frNamed: 'Ô Allah, accorde à {name} une science utile et des œuvres pieuses.',
    frPlural: 'Ô Allah, accorde-nous une science utile et des œuvres pieuses.',
  ),
];

/// Isole le prénom (souvent en lettres latines) dans le texte arabe : l'ordre d'affichage reste juste.
String _isolate(String name) => '\u2068$name\u2069';

/// Prénom affichable : premier mot du nom du compte, ou null.
String? firstName(String? displayName) {
  final n = displayName?.trim().split(RegExp(r'\s+')).first ?? '';
  return n.isEmpty ? null : n;
}

/// Invocation du jour (change chaque jour, la même toute la journée) ; [offset] pour en voir une autre.
({String ar, String fr}) duaOfDay(DateTime day, String? name, {int offset = 0}) {
  final index = (DateTime(day.year, day.month, day.day).difference(DateTime(2026)).inDays + offset) % kPersonalDuas.length;
  final d = kPersonalDuas[index < 0 ? index + kPersonalDuas.length : index];
  if (name == null) return (ar: d.plural, fr: d.frPlural);
  return (ar: d.named.replaceAll('{name}', _isolate(name)), fr: d.frNamed.replaceAll('{name}', name));
}
