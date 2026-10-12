import 'package:flutter/material.dart';

import 'i18n.dart';

/// Règles de tajwid détectées automatiquement dans le texte Qalun (mushaf des Awqaf libyens).
///
/// Seules les règles qui se déduisent sans ambiguïté des lettres et des signes écrits sont
/// coloriées, y compris les spécificités de Qalun marquées par le mushaf (tas-hil, ikhtilas) ou
/// déductibles des lettres (madd munfasil, sila du mim al-jam‘).
///
/// Conventions d'écriture du texte, vérifiées sur les 6214 ayat :
/// - tanwin « empilé » (U+064B–064D) = izhar ; tanwin « décalé » (U+0657 fath, U+065E damm,
///   U+0656 kasr) = idgham ou ikhfa ;
/// - petit mim (U+06E2) = iqlab ;
/// - alif initial portant U+06EC, U+06EA ou U+06DF = hamzat al-wasl ;
/// - lam de l'article sans signe = lam solaire (non prononcé), lam avec soukoun = lam lunaire ;
/// - signe de madd (U+0653) : lazim devant soukoun/chadda, muttasil devant une hamza du même mot ;
/// - madd munfasil : NON marqué par le mushaf, déduit (lettre de prolongation en fin de mot + hamza
///   au début du mot suivant) ;
/// - U+06EC / U+06DF à l'intérieur d'un mot (sur alif, ra, hamza…) = hamza facilitée (tas-hil) ;
///   U+06EC / U+06EA sur une autre consonne = ikhtilas (نِعِمَّا، تَعْدُّواْ، يَهْدِّے، يَخْصِّمُونَ)
///   ou ichmam (سِيٓءَ، سِيٓـَٔتْ، تَأْمَنَّا) ; U+06EA devant un alif = imala (هَارٍ) ;
/// - deux hamzas fathées entre deux mots : la 1re est déjà absente du texte (جَا أَجَلُهُمْ).
enum TajweedRule {
  ghunna,
  idghamGhunna,
  idghamNoGhunna,
  ikhfa,
  iqlab,
  ikhfaShafawi,
  idghamShafawi,
  qalqala,
  maddLazim,
  maddMuttasil,
  hamzatWasl,
  lamShamsiyya,
  silent,
  // Spécificités de Qalun
  maddMunfasil,
  mimJam,
  tashil,
  ikhtilas,
  ishmam,
  imala;

  bool get qalun => index >= maddMunfasil.index;

  String get title => switch (this) {
        ghunna => 'Ghunna',
        idghamGhunna => 'Idgham avec ghunna',
        idghamNoGhunna => 'Idgham sans ghunna',
        ikhfa => 'Ikhfa',
        iqlab => 'Iqlab',
        ikhfaShafawi => 'Ikhfa shafawi',
        idghamShafawi => 'Idgham shafawi',
        qalqala => 'Qalqala',
        maddLazim => 'Madd lazim',
        maddMuttasil => 'Madd muttasil',
        hamzatWasl => 'Hamzat al-wasl',
        lamShamsiyya => 'Lam solaire',
        silent => 'Lettre non prononcée',
        maddMunfasil => 'Madd munfasil',
        mimJam => 'Mim al-jam‘ (sila)',
        tashil => 'Tas-hil',
        ikhtilas => 'Ikhtilas',
        ishmam => 'Ichmam',
        imala => 'Imala',
      };

  String get arabic => switch (this) {
        ghunna => 'غُنَّة',
        idghamGhunna => 'إِدْغَام بِغُنَّة',
        idghamNoGhunna => 'إِدْغَام بِلَا غُنَّة',
        ikhfa => 'إِخْفَاء',
        iqlab => 'إِقْلَاب',
        ikhfaShafawi => 'إِخْفَاء شَفَوِي',
        idghamShafawi => 'إِدْغَام شَفَوِي',
        qalqala => 'قَلْقَلَة',
        maddLazim => 'مَدّ لَازِم',
        maddMuttasil => 'مَدّ مُتَّصِل',
        hamzatWasl => 'هَمْزَة الوَصْل',
        lamShamsiyya => 'اللَّام الشَّمْسِيَّة',
        silent => 'حَرْف لَا يُنْطَق',
        maddMunfasil => 'مَدّ مُنْفَصِل',
        mimJam => 'صِلَة مِيم الجَمْع',
        tashil => 'تَسْهِيل',
        ikhtilas => 'اِخْتِلَاس',
        ishmam => 'إِشْمَام',
        imala => 'إِمَالَة',
      };

  String get explanation => switch (this) {
        ghunna => 'Noun ou mim portant une chadda : on prolonge le son nasal (ghunna) environ 2 temps.',
        idghamGhunna =>
          'Noun sakina ou tanwin suivi, dans le mot suivant, de ي ن م و : le noun se fond dans la lettre suivante en gardant la ghunna (environ 2 temps).',
        idghamNoGhunna => 'Noun sakina ou tanwin suivi, dans le mot suivant, de ل ou ر : le noun se fond entièrement dans la lettre suivante, sans ghunna.',
        ikhfa =>
          'Noun sakina ou tanwin suivi de l’une des 15 lettres de l’ikhfa (ت ث ج د ذ ز س ش ص ض ط ظ ف ق ك) : le noun est prononcé de façon cachée, avec ghunna (environ 2 temps).',
        iqlab => 'Noun sakina ou tanwin suivi de ب (signalé par le petit mim) : le noun devient un mim caché, avec ghunna (environ 2 temps).',
        ikhfaShafawi => 'Mim sakina suivi de ب dans le mot suivant : le mim est caché entre les lèvres, avec ghunna (environ 2 temps).',
        idghamShafawi => 'Mim sakina suivi d’un autre mim : les deux mim se fondent en un mim avec chadda et ghunna (environ 2 temps).',
        qalqala =>
          'L’une des lettres ق ط ب ج د sans voyelle (soukoun, ou en fin d’ayah à l’arrêt) : on la fait légèrement rebondir, sans y ajouter de voyelle.',
        maddLazim => 'Lettre de prolongation suivie d’un soukoun ou d’une chadda (ou nom de lettre au début de certaines sourates) : prolongation obligatoire de 6 temps.',
        maddMuttasil =>
          'Lettre de prolongation suivie d’une hamza dans le même mot : prolongation obligatoire. Chez Qalun : prolongation moyenne (tawassut), enseignée en général à 4 temps par la voie de la Chatibiyya — à confirmer avec votre enseignant.',
        hamzatWasl =>
          'Alif de liaison : non prononcé quand on enchaîne avec le mot précédent ; si l’on commence la lecture par ce mot, on le prononce avec la voyelle indiquée.',
        lamShamsiyya => 'Lam de l’article devant une lettre solaire : il n’est pas prononcé, la lettre suivante est doublée.',
        silent => 'Alif écrit après le waw du pluriel : il n’est pas prononcé.',
        maddMunfasil =>
          'Lettre de prolongation en fin de mot, suivie d’une hamza au début du mot suivant (cas aussi de la sila de la hā’ du pronom devant une hamza). Qalun a deux options : court (qasr, 2 temps) ou moyen (tawassut). Le mushaf ne le signale pas : suivez l’option de votre enseignant et gardez-la dans toute la lecture.',
        mimJam =>
          'Mim du pluriel (ـهُمْ، ـكُمْ، ـتُمْ) suivi d’une lettre voyellée : Qalun peut le lire sans voyelle (comme écrit) ou avec sila, c’est-à-dire avec une damma prolongée de 2 temps (عَلَيْهِمُو). Devant une hamza, la sila suit la longueur choisie pour le madd munfasil.',
        tashil =>
          'Hamza facilitée (tas-hil) : elle se prononce de façon allégée, entre la hamza et la lettre de prolongation de sa voyelle. Chez Qalun : 2e hamza dans un même mot, avec un alif d’insertion (ءَا۬نذَرْتَهُمْ، أَٰ۟ذَا), أَرَا۬يْتَ، هَٰا۬نتُمْ, et 1re de deux hamzas de même voyelle (kasra ou damma) entre deux mots (هَٰؤُلَآ۟ إِن). Quand les deux sont en fatha, la 1re tombe : elle est déjà absente du texte (جَا أَجَلُهُمْ).',
        ikhtilas =>
          'Voyelle prononcée de façon brève et furtive (ikhtilas), signalée par le mushaf : نِعِمَّا، لَا تَعْدُّواْ، يَهْدِّے، يَخْصِّمُونَ. Une autre option (iskan) est aussi rapportée pour Qalun : suivez votre enseignant.',
        ishmam =>
          'Ichmam : on mêle à la voyelle un soupçon de damma. Chez Qalun dans سِيٓءَ et سِيٓـَٔتْ (la kasra du س prend une nuance de damma) ; dans تَأْمَنَّا, les lèvres s’arrondissent sur le noun (ichmam), ou la voyelle est prononcée furtivement (rawm).',
        imala =>
          'Imala : le « a » long tire vers le « é ». Chez Qalun, imala complète dans un seul mot : هَارٍ (at-Tawba). Les autres mots se lisent sans imala (التَّوْرَىٰةَ admet chez Qalun une imala légère ou la lecture droite : suivez votre enseignant).',
      };

  /// Nom et explication dans la langue de l'interface.
  String get label => I18n.isAr ? arabic : title;
  String get info => I18n.isAr ? arExplanation : explanation;

  String get arExplanation => switch (this) {
        ghunna => 'نون أو ميم مشدّدة: تُمدّ الغنّة بمقدار حركتين تقريبًا.',
        idghamGhunna => 'نون ساكنة أو تنوين بعدهما في الكلمة التالية أحد حروف «ينمو»: تُدغم النون في الحرف التالي مع بقاء الغنّة (حركتان تقريبًا).',
        idghamNoGhunna => 'نون ساكنة أو تنوين بعدهما في الكلمة التالية لام أو راء: تُدغم النون إدغامًا كاملًا بلا غنّة.',
        ikhfa =>
          'نون ساكنة أو تنوين بعدهما أحد حروف الإخفاء الخمسة عشر (ت ث ج د ذ ز س ش ص ض ط ظ ف ق ك): تُنطق النون مخفاةً مع الغنّة (حركتان تقريبًا).',
        iqlab => 'نون ساكنة أو تنوين بعدهما باء (وتدلّ عليه الميم الصغيرة): تُقلب النون ميمًا مخفاةً مع الغنّة (حركتان تقريبًا).',
        ikhfaShafawi => 'ميم ساكنة بعدها باء في الكلمة التالية: تُخفى الميم بين الشفتين مع الغنّة (حركتان تقريبًا).',
        idghamShafawi => 'ميم ساكنة بعدها ميم: تُدغمان في ميم واحدة مشدّدة مع الغنّة (حركتان تقريبًا).',
        qalqala => 'أحد حروف «قطب جد» ساكنًا (أو في آخر الآية عند الوقف): يُنطق بنبرة خفيفة دون إضافة حركة.',
        maddLazim => 'حرف مدّ بعده سكون أو تشديد (أو اسم حرف في فواتح بعض السور): مدّ لازم بمقدار ست حركات.',
        maddMuttasil =>
          'حرف مدّ بعده همزة في الكلمة نفسها: مدّ واجب. ولقالون التوسّط، ويُقرأ في الغالب بأربع حركات من طريق الشاطبية — تأكّد من ذلك مع شيخك.',
        hamzatWasl => 'ألف الوصل: تسقط في الدَّرج عند وصلها بما قبلها، وتُنطق بالحركة المبيّنة إذا ابتُدئ بها.',
        lamShamsiyya => 'لام التعريف قبل حرف شمسي: لا تُنطق، ويُشدَّد الحرف الذي بعدها.',
        silent => 'ألف مكتوبة بعد واو الجماعة: لا تُنطق.',
        maddMunfasil =>
          'حرف مدّ في آخر الكلمة بعده همزة في أول الكلمة التالية (ومنه صلة هاء الكناية قبل الهمزة). لقالون وجهان: القصر (حركتان) والتوسّط. لا يشير المصحف إليه: اتّبع الوجه الذي يأخذ به شيخك والتزمه في القراءة كلها.',
        mimJam =>
          'ميم الجمع (ـهُمْ، ـكُمْ، ـتُمْ) بعدها حرف متحرّك: يقرؤها قالون بالإسكان كما رُسمت، أو بالصلة أي بضمّة ممدودة بحركتين (عَلَيْهِمُو). وقبل الهمزة تتبع الصلة مقدار المدّ المنفصل المختار.',
        tashil =>
          'الهمزة المسهّلة: تُنطق بين الهمزة وحرف المدّ المجانس لحركتها. ويسهّل قالون الهمزة الثانية في الكلمة الواحدة مع الإدخال (ءَا۬نذَرْتَهُمْ، أَٰ۟ذَا)، وفي أَرَا۬يْتَ وهَٰا۬نتُمْ، والهمزة الأولى من همزتين متّفقتين بالكسر أو الضمّ من كلمتين (هَٰؤُلَآ۟ إِن). أمّا المتّفقتان بالفتح فتسقط الأولى، وهي محذوفة من النصّ أصلًا (جَا أَجَلُهُمْ).',
        ikhtilas =>
          'اختلاس الحركة أي النطق بها خاطفة، وقد أشار إليه المصحف في: نِعِمَّا، لَا تَعْدُّواْ، يَهْدِّے، يَخْصِّمُونَ. ويُروى لقالون وجه آخر هو الإسكان: اتّبع شيخك.',
        ishmam =>
          'الإشمام: مزج الحركة بشيء من الضمّ. لقالون في سِيٓءَ وسِيٓـَٔتْ (تُشمّ كسرة السين ضمًّا)، وفي تَأْمَنَّا يُشمّ النون (ضمّ الشفتين) أو تُختلس حركتها (الرَّوْم).',
        imala =>
          'الإمالة: تقريب الفتحة من الكسرة والألف من الياء. ولقالون إمالة كبرى في كلمة واحدة: هَارٍ (التوبة). وسائر الكلمات بالفتح، وله في التَّوْرَىٰةَ التقليل والفتح: اتّبع شيخك.',
      };

  /// Couleurs proches des mushafs de tajwid courants, avec une version claire pour le mode sombre.
  Color color(Brightness b) {
    final dark = b == Brightness.dark;
    return switch (this) {
      ghunna || idghamGhunna || idghamShafawi => dark ? const Color(0xFF5FD37F) : const Color(0xFF1E8E3E),
      ikhfa || iqlab || ikhfaShafawi => dark ? const Color(0xFF4FD1C5) : const Color(0xFF00897B),
      idghamNoGhunna => dark ? const Color(0xFF8FA6C8) : const Color(0xFF6B7C93),
      qalqala => dark ? const Color(0xFF7FB2FF) : const Color(0xFF1A5FD0),
      maddLazim => dark ? const Color(0xFFFF7B7B) : const Color(0xFFB0102A),
      maddMuttasil => dark ? const Color(0xFFFFA06B) : const Color(0xFFC94716),
      hamzatWasl || lamShamsiyya || silent => dark ? const Color(0xFF8E9693) : const Color(0xFFA7ADAB),
      maddMunfasil => dark ? const Color(0xFFF48FB1) : const Color(0xFFC2185B),
      mimJam => dark ? const Color(0xFFFFB74D) : const Color(0xFFA35F00),
      tashil => dark ? const Color(0xFFC39BFF) : const Color(0xFF7B3FBF),
      ikhtilas || ishmam => dark ? const Color(0xFFD7B49E) : const Color(0xFF8D5A3B),
      imala => dark ? const Color(0xFFC5D86D) : const Color(0xFF6B7D00),
    };
  }

  /// Couleur du nom de la règle (les gris, trop pâles pour du texte courant, sont foncés).
  Color labelColor(Brightness b) =>
      (this == hamzatWasl || this == lamShamsiyya || this == silent) ? (b == Brightness.dark ? const Color(0xFFA3B1AC) : const Color(0xFF6F7775)) : color(b);
}

class TajweedSegment {
  const TajweedSegment(this.text, this.rule);
  final String text;
  final TajweedRule? rule;
}

/// Découpe un ayah en segments, chaque segment portant éventuellement une règle.
List<TajweedSegment> tajweedSegments(String text, {bool isFirstAyahs = false}) {
  final clusters = _clusters(text);
  final rules = _rulesFor(clusters, isFirstAyahs);
  final out = <TajweedSegment>[];
  final buf = StringBuffer();
  TajweedRule? current;
  for (var i = 0; i < clusters.length; i++) {
    final r = rules[i];
    if (r != current && buf.isNotEmpty) {
      out.add(TajweedSegment(buf.toString(), current));
      buf.clear();
    }
    current = r;
    buf.write(clusters[i]);
  }
  if (buf.isNotEmpty) out.add(TajweedSegment(buf.toString(), current));
  return out;
}

/// Règle de chaque groupe lettre + signes, sans jamais séparer un lam de l'alif qui le suit :
/// « لا » est une ligature, et la couper entre deux morceaux de couleur différente l'affiche
/// en deux lettres disjointes (ل ا). Le lam prend alors la couleur de l'alif (ou l'inverse).
List<TajweedRule?> _rulesFor(List<String> clusters, bool isFirstAyahs) {
  final rules = [for (var i = 0; i < clusters.length; i++) _ruleAt(clusters, i, isFirstAyahs)];
  for (var i = 1; i < clusters.length; i++) {
    if (rules[i] == rules[i - 1] || !isLamAlef(clusters[i - 1], clusters[i])) continue;
    if (rules[i] != null) {
      rules[i - 1] = rules[i];
    } else {
      rules[i] = rules[i - 1];
    }
  }
  return rules;
}

/// Vrai si [a] (lam + signes) et [b] (alif, avec ou sans hamza/madda/wasla) forment la ligature lam-alif.
bool isLamAlef(String a, String b) => a.isNotEmpty && b.isNotEmpty && a.codeUnitAt(0) == 0x0644 && _alefs.contains(b.codeUnitAt(0));

const _alefs = {0x0627, 0x0623, 0x0625, 0x0622, 0x0671};

/// Règles présentes dans un ayah, chacune avec sa première occurrence : le mot concerné et le
/// mot suivant (utile pour l'idgham ou l'ikhfa entre deux mots), seule la règle étant mise en valeur.
Map<TajweedRule, List<TajweedSegment>> tajweedSummary(String text, {bool isFirstAyahs = false}) {
  final clusters = _clusters(text);
  final rules = _rulesFor(clusters, isFirstAyahs);
  final found = <TajweedRule, List<TajweedSegment>>{};
  for (var i = 0; i < clusters.length; i++) {
    final r = rules[i];
    if (r == null || found.containsKey(r)) continue;
    var s = i, e = i;
    while (s > 0 && clusters[s - 1] != ' ') {
      s--;
    }
    while (e < clusters.length - 1 && clusters[e + 1] != ' ') {
      e++;
    }
    if (e + 2 < clusters.length) {
      e += 2; // espace + mot suivant
      while (e < clusters.length - 1 && clusters[e + 1] != ' ') {
        e++;
      }
    }
    final segs = <TajweedSegment>[];
    for (var k = s; k <= e; k++) {
      final rule = rules[k] == r ? r : null;
      if (segs.isNotEmpty && segs.last.rule == rule) {
        segs[segs.length - 1] = TajweedSegment(segs.last.text + clusters[k], rule);
      } else {
        segs.add(TajweedSegment(clusters[k], rule));
      }
    }
    found[r] = segs;
  }
  return found;
}

// ---------------------------------------------------------------------------

const _fathatan = 0x064B, _dammatan = 0x064C, _kasratan = 0x064D;
const _fatha = 0x064E, _damma = 0x064F, _kasra = 0x0650, _shadda = 0x0651, _sukun = 0x0652;
const _maddah = 0x0653, _hamzaAbove = 0x0654, _hamzaBelow = 0x0655;
const _openKasratan = 0x0656, _openFathatan = 0x0657, _openDammatan = 0x065E;
const _daggerAlif = 0x0670, _smallWaw = 0x06E5, _smallYeh = 0x06E6, _smallMeem = 0x06E2;
const _markTashil = 0x06EC, _markLow = 0x06EA, _markZero = 0x06DF;
const _waslMarks = {_markTashil, _markLow, _markZero};

const _vowels = {_fathatan, _dammatan, _kasratan, _fatha, _damma, _kasra, _shadda, _openKasratan, _openFathatan, _openDammatan, _maddah, _smallMeem};
const _openTanween = {_openKasratan, _openFathatan, _openDammatan};

const _ikhfaLetters = 'تثجدذزسشصضطظفقك';
const _qalqalaLetters = 'قطبجد';
const _sunLetters = 'تثدذرزسشصضطظلن';
const _maddLetters = 'اويىے';
const _hamzaLetters = 'ءأإؤئ';

bool _isMark(int c) => (c >= 0x064B && c <= 0x065F) || c == _daggerAlif || (c >= 0x06D6 && c <= 0x06ED);

List<String> _clusters(String text) {
  final out = <String>[];
  for (final c in text.runes) {
    final ch = String.fromCharCode(c);
    if (_isMark(c) && out.isNotEmpty && out.last != ' ') {
      out[out.length - 1] += ch;
    } else {
      out.add(ch);
    }
  }
  return out;
}

Set<int> _marks(String cluster) => cluster.runes.skip(1).toSet();
String _base(String cluster) => String.fromCharCode(cluster.runes.first);

/// Indice du groupe suivant (en sautant les espaces) et indication du passage à un autre mot.
(int, bool)? _next(List<String> cl, int i) {
  var j = i + 1;
  var crossed = false;
  while (j < cl.length && cl[j] == ' ') {
    j++;
    crossed = true;
  }
  return j < cl.length ? (j, crossed) : null;
}

bool _isWordStart(List<String> cl, int i) => i == 0 || cl[i - 1] == ' ';

bool _isHamza(String cluster) {
  final b = _base(cluster);
  if (_hamzaLetters.contains(b)) return true;
  final m = _marks(cluster);
  return b == 'ـ' && (m.contains(_hamzaAbove) || m.contains(_hamzaBelow));
}

bool _onlyPauseMarks(Set<int> m) => m.every((c) => c >= 0x06D6 && c <= 0x06DC);

/// Madd munfasil : lettre de prolongation finale + hamza au début du mot suivant,
/// ou يَٰأَيُّهَا (munfasil « hukmi » écrit en un seul mot).
bool _isMunfasil(List<String> cl, int i) {
  final c = cl[i];
  final b = _base(c);
  final m = _marks(c);

  // يَٰأَيُّهَا
  if (b == 'ي' && _isWordStart(cl, i) && m.contains(_daggerAlif) && m.contains(_fatha)) {
    return i + 1 < cl.length && _isHamza(cl[i + 1]);
  }

  // Fin de mot, éventuellement suivie de l'alif muet du pluriel (قَالُواْ).
  var end = i;
  if (b == 'و' && end + 1 < cl.length && _base(cl[end + 1]) == 'ا' && _marks(cl[end + 1]).contains(_sukun)) end++;
  if (end + 1 >= cl.length || cl[end + 1] != ' ') return false;
  final nx = _next(cl, end);
  if (nx == null || !_isHamza(cl[nx.$1])) return false;
  final next = cl[nx.$1];

  // أَنَا devant une hamza en kasra : deux options chez Qalun (alif prononcé ou non) → non colorié.
  final word = _wordAt(cl, i).replaceAll(RegExp('[\\u064B-\\u0670\\u06D6-\\u06ED]'), '');
  if (RegExp(r'^[وف]?أنا$').hasMatch(word) && (_base(next) == 'إ' || _marks(next).contains(_kasra))) return false;

  if (m.contains(_smallWaw) || m.contains(_smallYeh)) return true; // sila (هُۥ، هِۦ) ou lettre de prolongation ajoutée
  if (!_onlyPauseMarks(m)) return b == 'ى' && m.contains(_daggerAlif);
  if (i == 0) return false;
  final pm = _marks(cl[i - 1]);
  return switch (b) {
    'ا' || 'ى' => pm.contains(_fatha) || pm.contains(_daggerAlif),
    'و' => pm.contains(_damma),
    'ي' || 'ے' => pm.contains(_kasra),
    _ => false,
  };
}

String _wordAt(List<String> cl, int i) {
  var s = i, e = i;
  while (s > 0 && cl[s - 1] != ' ') {
    s--;
  }
  while (e < cl.length - 1 && cl[e + 1] != ' ') {
    e++;
  }
  return cl.sublist(s, e + 1).join();
}

/// Classe la lettre qui suit un noun sakina ou un tanwin.
TajweedRule? _noonRule(String nextBase, bool crossed) {
  if (_ikhfaLetters.contains(nextBase)) return TajweedRule.ikhfa;
  if (!crossed) return null; // dans un même mot : izhar (دنيا، قنوان…) ou cas non concernés
  if ('ينمو'.contains(nextBase)) return TajweedRule.idghamGhunna;
  if ('لر'.contains(nextBase)) return TajweedRule.idghamNoGhunna;
  return null; // lettres de la gorge : izhar, non colorié
}

TajweedRule? _ruleAt(List<String> cl, int i, bool isFirstAyahs) {
  final c = cl[i];
  if (c == ' ') return null;
  final b = _base(c);
  final m = _marks(c);
  final nx = _next(cl, i);
  final nextCluster = nx == null ? null : cl[nx.$1];
  final crossed = nx?.$2 ?? false;
  final nextBase = nextCluster == null ? null : _base(nextCluster);
  final noVowel = m.intersection(_vowels).isEmpty;

  final maddBearer = _maddLetters.contains(b) || m.contains(_daggerAlif) || m.contains(_smallWaw) || m.contains(_smallYeh);

  // Lettres isolées en tête de sourate (الٓمٓ، صٓ، قٓ…) : madd lazim harfi.
  if (m.contains(_maddah) && !maddBearer && isFirstAyahs && !_hamzaLetters.contains(b)) return TajweedRule.maddLazim;

  // Ghunna : noun / mim avec chadda.
  if ((b == 'ن' || b == 'م') && m.contains(_shadda)) return TajweedRule.ghunna;

  // Iqlab : petit mim.
  if (m.contains(_smallMeem) && nx != null) return TajweedRule.iqlab; // en fin d'ayah, l'arrêt l'emporte

  // Noun sakina.
  if (b == 'ن' && noVowel && nextBase != null && nextBase != 'ا' && nextBase != 'ى') {
    final r = _noonRule(nextBase, crossed);
    if (r != null) return r;
  }

  // Tanwin décalé (idgham / ikhfa) en fin de mot.
  if (m.intersection(_openTanween).isNotEmpty && crossed && nextBase != null) {
    final r = _noonRule(nextBase, true);
    if (r != null) return r;
  }

  // Mim sakina devant ب ou م (mot suivant).
  if (b == 'م' && noVowel && crossed && nextBase != null) {
    if (nextBase == 'ب') return TajweedRule.ikhfaShafawi;
    if (nextBase == 'م') return TajweedRule.idghamShafawi;
  }

  // Madd marqué par le signe ٓ.
  if (m.contains(_maddah) && maddBearer && nextCluster != null && !crossed) {
    if (_isHamza(nextCluster)) return TajweedRule.maddMuttasil;
    final nm = _marks(nextCluster);
    if (nm.contains(_sukun) || nm.contains(_shadda)) return TajweedRule.maddLazim;
  }

  // Qalun : hamza facilitée (tas-hil) et ikhtilas, marqués par le mushaf à l'intérieur d'un mot.
  if (!(b == 'ا' && _isWordStart(cl, i))) {
    if (m.contains(_markZero)) return TajweedRule.tashil; // أَٰ۟ذَا، هَٰؤُلَآ۟ إِن
    if (m.contains(_markTashil)) {
      if ('اأ'.contains(b) || m.contains(_daggerAlif)) return TajweedRule.tashil; // أَرَٰ۬يْتَ، ءَٰا۬نتُمْ
      if (b == 'س' || b == 'م') return TajweedRule.ishmam; // سِيٓءَ، سِيٓـَٔتْ، تَأْمَنَّا
      return TajweedRule.ikhtilas; // تَعْدُّواْ، يَهْدِّے، يَخْصِّمُونَ
    }
    if (m.contains(_markLow)) {
      if (nextCluster != null && !crossed && nextBase == 'ا') return TajweedRule.imala; // هَارٍ
      return b == 'ي' ? TajweedRule.tashil : TajweedRule.ikhtilas; // أَئِمَّةَ / نِعِمَّا
    }
  }

  // Qalun : madd munfasil (non marqué par le mushaf).
  if (_isMunfasil(cl, i)) return TajweedRule.maddMunfasil;

  // Qalun : mim al-jam‘ suivi d'une lettre voyellée (sila possible).
  if (b == 'م' && m.contains(_sukun) && crossed && nextCluster != null && i > 0 && cl[i + 1] == ' ') {
    final prev = cl[i - 1];
    final pm = _marks(prev);
    final pronoun = 'هكت'.contains(_base(prev)) && (pm.contains(_damma) || pm.contains(_kasra));
    final nm = _marks(nextCluster);
    final nextVowelled = nm.contains(_fatha) || nm.contains(_damma) || nm.contains(_kasra);
    final nextWasl = nextBase == 'ا';
    if (pronoun && nextVowelled && !nextWasl) return TajweedRule.mimJam;
  }

  // Hamzat al-wasl.
  if (b == 'ا' && _isWordStart(cl, i) && m.intersection(_waslMarks).isNotEmpty) return TajweedRule.hamzatWasl;

  // Lam solaire : lam de l'article sans signe devant une lettre solaire.
  if (b == 'ل' && m.isEmpty && i > 0 && _base(cl[i - 1]) == 'ا' && nextCluster != null && !crossed && _sunLetters.contains(nextBase!)) {
    return TajweedRule.lamShamsiyya;
  }

  // Alif non prononcé après le waw du pluriel.
  if (b == 'ا' && m.contains(_sukun) && i > 0 && _base(cl[i - 1]) == 'و') return TajweedRule.silent;

  // Qalqala : soukoun, ou dernière lettre de l'ayah (à l'arrêt).
  if (_qalqalaLetters.contains(b)) {
    if (m.contains(_sukun) && !(nextCluster != null && !crossed && _marks(nextCluster).contains(_shadda))) return TajweedRule.qalqala;
    if (nx == null) return TajweedRule.qalqala;
  }
  return null;
}
