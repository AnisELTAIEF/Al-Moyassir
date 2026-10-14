import 'package:flutter/material.dart';

/// Un dhikr / une invocation : texte arabe, traduction française, nombre de répétitions.
///
/// Ce sont des données (texte religieux), pas des libellés d'interface : elles ne passent pas
/// par `tr()` et s'affichent toujours en arabe, avec la traduction en dessous.
class Dhikr {
  const Dhikr(this.arabic, {this.translation, this.count = 1, this.source});
  final String arabic;
  final String? translation;
  final int count;
  final String? source;
}

/// Un recueil (adhkâr du matin, du soir, après la prière, du'as).
class DhikrSet {
  const DhikrSet({required this.id, required this.ar, required this.fr, required this.icon, required this.items});
  final String id;
  final String ar, fr;
  final IconData icon;
  final List<Dhikr> items;
}

const _ikhlas = 'قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ';
const _falaq =
    'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ';
const _nas =
    'قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ';
const _kursi =
    'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ';

const _istighfar =
    'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ';

final kAdhkar = <DhikrSet>[
  DhikrSet(
    id: 'matin',
    ar: 'أذكار الصباح',
    fr: 'Adhkâr du matin',
    icon: Icons.wb_twilight,
    items: const [
      Dhikr(_kursi, translation: 'Âyat al-Kursî — quiconque la lit le matin est protégé jusqu’au soir.', count: 1, source: 'Al-Baqara, 255'),
      Dhikr(_ikhlas, translation: 'Sourate al-Ikhlâs (×3).', count: 3),
      Dhikr(_falaq, translation: 'Sourate al-Falaq (×3).', count: 3),
      Dhikr(_nas, translation: 'Sourate an-Nâs (×3).', count: 3),
      Dhikr(
        'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
        translation: 'Nous voici au matin et la royauté appartient à Allah…',
      ),
      Dhikr(
        'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',
        translation: 'Ô Allah, par Toi nous entrons dans le matin… et vers Toi est la résurrection.',
      ),
      Dhikr(_istighfar, translation: 'Sayyid al-istighfâr — le maître des demandes de pardon.', count: 1, source: 'Al-Bukhârî'),
      Dhikr(
        'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَٰهَ إِلَّا أَنْتَ',
        translation: 'Ô Allah, préserve mon corps, mon ouïe et ma vue (×3).',
        count: 3,
      ),
      Dhikr(
        'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
        translation: 'Au nom d’Allah, avec le nom duquel rien ne peut nuire… (×3).',
        count: 3,
      ),
      Dhikr('رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا', translation: 'J’agrée Allah comme Seigneur, l’Islam comme religion et Muhammad ﷺ comme prophète (×3).', count: 3),
      Dhikr('حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ، وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ', translation: 'Allah me suffit… (×7).', count: 7),
      Dhikr('سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', translation: 'Gloire et louange à Allah (×100).', count: 100),
      Dhikr('لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', translation: 'Nulle divinité sauf Allah, Seul… (×10).', count: 10),
    ],
  ),
  DhikrSet(
    id: 'soir',
    ar: 'أذكار المساء',
    fr: 'Adhkâr du soir',
    icon: Icons.nightlight_round,
    items: const [
      Dhikr(_kursi, translation: 'Âyat al-Kursî — protection jusqu’au matin.', count: 1, source: 'Al-Baqara, 255'),
      Dhikr(_ikhlas, translation: 'Sourate al-Ikhlâs (×3).', count: 3),
      Dhikr(_falaq, translation: 'Sourate al-Falaq (×3).', count: 3),
      Dhikr(_nas, translation: 'Sourate an-Nâs (×3).', count: 3),
      Dhikr(
        'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
        translation: 'Nous voici au soir et la royauté appartient à Allah…',
      ),
      Dhikr(
        'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',
        translation: 'Ô Allah, par Toi nous entrons dans le soir… et vers Toi est le devenir.',
      ),
      Dhikr(_istighfar, translation: 'Sayyid al-istighfâr.', count: 1, source: 'Al-Bukhârî'),
      Dhikr(
        'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
        translation: 'Je cherche refuge par les paroles parfaites d’Allah contre le mal de ce qu’Il a créé (×3).',
        count: 3,
      ),
      Dhikr(
        'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
        translation: 'Au nom d’Allah, avec le nom duquel rien ne peut nuire… (×3).',
        count: 3,
      ),
      Dhikr('رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا', translation: 'J’agrée Allah comme Seigneur… (×3).', count: 3),
      Dhikr('سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', translation: 'Gloire et louange à Allah (×100).', count: 100),
    ],
  ),
  DhikrSet(
    id: 'salat',
    ar: 'أذكار بعد الصلاة',
    fr: 'Après la prière',
    icon: Icons.mosque_outlined,
    items: const [
      Dhikr('أَسْتَغْفِرُ اللَّهَ', translation: 'Je demande pardon à Allah (×3).', count: 3),
      Dhikr('اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ', translation: 'Ô Allah, Tu es la Paix et de Toi vient la paix…'),
      Dhikr('لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', translation: 'Nulle divinité sauf Allah, Seul, sans associé…'),
      Dhikr('سُبْحَانَ اللَّهِ', translation: 'Gloire à Allah (×33).', count: 33),
      Dhikr('الْحَمْدُ لِلَّهِ', translation: 'Louange à Allah (×33).', count: 33),
      Dhikr('اللَّهُ أَكْبَرُ', translation: 'Allah est le plus grand (×33).', count: 33),
      Dhikr('لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', translation: 'Pour compléter les cent.'),
      Dhikr(_kursi, translation: 'Âyat al-Kursî après chaque prière obligatoire.', count: 1),
      Dhikr('اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ', translation: 'Ô Allah, aide-moi à T’évoquer, à Te remercier et à bien T’adorer.'),
    ],
  ),
  DhikrSet(
    id: 'duaa',
    ar: 'أدعية مأثورة',
    fr: 'Invocations (du‘â’)',
    icon: Icons.volunteer_activism_outlined,
    items: const [
      Dhikr('رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', translation: 'Seigneur, accorde-nous un bien ici-bas et dans l’au-delà, et préserve-nous du châtiment du Feu.', source: 'Al-Baqara, 201'),
      Dhikr('رَبَّنَا لَا تُؤَاخِذْنَا إِن نَّسِينَا أَوْ أَخْطَأْنَا', translation: 'Seigneur, ne nous châtie pas si nous oublions ou commettons une erreur.', source: 'Al-Baqara, 286'),
      Dhikr('رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', translation: 'Seigneur, ouvre-moi la poitrine et facilite-moi ma tâche.', source: 'Tâ-Hâ, 25-26'),
      Dhikr('رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا', translation: 'Seigneur, fais de nos épouses et de nos descendants la joie de nos yeux…', source: 'Al-Furqân, 74'),
      Dhikr('لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ', translation: 'Du‘â’ de Dhû-n-Nûn (Yûnus) — pour la délivrance de toute épreuve.', source: 'Al-Anbiyâ’, 87'),
      Dhikr('حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', translation: 'Allah nous suffit, et quel excellent protecteur !', source: 'Âl ‘Imrân, 173'),
      Dhikr('اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْبُخْلِ وَالْجُبْنِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ', translation: 'Ô Allah, je cherche refuge auprès de Toi contre le souci, la tristesse, l’incapacité, la paresse…', source: 'Al-Bukhârî'),
      Dhikr('اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى', translation: 'Ô Allah, je Te demande la guidée, la piété, la chasteté et la richesse (du cœur).', source: 'Muslim'),
      Dhikr('اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي', translation: 'Ô Allah, Tu es Pardonneur et Tu aimes le pardon, pardonne-moi. (Laylat al-Qadr)', source: 'At-Tirmidhî'),
      Dhikr('رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', translation: 'Seigneur, pardonne-moi ainsi qu’à mes parents, et fais-leur miséricorde comme ils m’ont élevé petit.'),
    ],
  ),
];
