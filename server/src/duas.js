// Invocation de l'heure : une courte invocation par heure, de 8 h à 21 h (heure de l'appareil), pour ceux qui l'ont activée.
// Texte religieux : toujours en arabe, avec une traduction française courte. Pas de répétition d'une heure à l'autre.
export const HOURLY_DUAS = [
  ['رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', 'Seigneur, accorde-nous un bien ici-bas et dans l’au-delà, et protège-nous du feu.'],
  ['رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', 'Seigneur, ouvre-moi la poitrine et facilite-moi ma tâche.'],
  ['يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ', 'Ô Celui qui retourne les cœurs, affermis mon cœur dans Ta religion.'],
  ['اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي', 'Ô Allah, Tu es Pardonneur et Tu aimes le pardon : pardonne-moi.'],
  ['رَبِّ زِدْنِي عِلْمًا', 'Seigneur, augmente ma science.'],
  ['اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا', 'Ô Allah, fais-moi profiter de ce que Tu m’as appris, apprends-moi ce qui m’est utile et augmente ma science.'],
  ['اللَّهُمَّ اجْعَلِ الْقُرْآنَ رَبِيعَ قَلْبِي وَنُورَ صَدْرِي وَجَلَاءَ حُزْنِي وَذَهَابَ هَمِّي', 'Ô Allah, fais du Coran le printemps de mon cœur, la lumière de ma poitrine, la fin de ma tristesse et de mon souci.'],
  ['أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', 'Je demande pardon à Allah et je reviens à Lui.'],
  ['سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ', 'Gloire et louange à Allah, gloire à Allah l’Immense.'],
  ['لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', 'Il n’y a de force ni de puissance qu’en Allah.'],
  ['اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ', 'Ô Allah, prie sur notre Prophète Muhammad ﷺ et salue-le.'],
  ['رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً', 'Seigneur, ne laisse pas dévier nos cœurs après nous avoir guidés, et accorde-nous Ta miséricorde.'],
  ['اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى', 'Ô Allah, je Te demande la guidée, la piété, la chasteté et la suffisance.'],
  ['حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ', 'Allah me suffit : nulle divinité sauf Lui, en Lui je place ma confiance.'],
  ['رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ', 'Seigneur, accepte de nous : Tu es l’Audient, l’Omniscient.'],
  ['اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ', 'Ô Allah, aide-moi à T’évoquer, à Te remercier et à bien T’adorer.'],
  ['رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', 'Seigneur, pardonne-moi ainsi qu’à mes parents, et fais-leur miséricorde comme ils m’ont élevé petit.'],
  ['اللَّهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي، وَأَصْلِحْ لِي دُنْيَايَ الَّتِي فِيهَا مَعَاشِي', 'Ô Allah, améliore ma religion, qui est la sauvegarde de mon affaire, et ma vie d’ici-bas où je subsiste.'],
  ['اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ', 'Ô Allah, je Te demande le Paradis et je cherche refuge auprès de Toi contre le Feu.'],
  ['رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا', 'Seigneur, accorde-nous de nos épouses et de nos descendants la joie des yeux, et fais de nous des guides pour les pieux.'],
  ['لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ', 'Nulle divinité sauf Toi, gloire à Toi ! J’étais du nombre des injustes.'],
  ['اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ', 'Ô Allah, je cherche refuge auprès de Toi contre le souci et la tristesse, l’impuissance et la paresse.'],
  ['رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا وَثَبِّتْ أَقْدَامَنَا', 'Seigneur, pardonne nos péchés et nos excès, affermis nos pas.'],
  ['رَضِيتُ بِاللَّهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ ﷺ نَبِيًّا', 'J’agrée Allah comme Seigneur, l’Islam comme religion et Muhammad ﷺ comme prophète.'],
];

/** L'invocation de cette heure (UTC, en nombre d'heures écoulées) : la même pour tous, différente d'une heure à l'autre. */
export const duaOfHour = (utcHourIndex) => HOURLY_DUAS[utcHourIndex % HOURLY_DUAS.length];

export const FIRST_HOUR = 8;
export const LAST_HOUR = 21;

/** Envoie l'invocation de l'heure aux comptes qui l'ont activée et pour qui il est entre 8 h et 21 h. Renvoie le nombre de comptes visés. */
export async function sendHourlyDuas(app, now = new Date(), push) {
  const hourIndex = Math.floor(now.getTime() / 3_600_000);
  const [ar, fr] = duaOfHour(hourIndex);
  const [users] = await app.db.query('SELECT user_id, utc_offset_min FROM dua_prefs WHERE hourly = 1');
  let n = 0;
  for (const u of users) {
    const local = new Date(now.getTime() + u.utc_offset_min * 60_000).getUTCHours();
    if (local < FIRST_HOUR || local > LAST_HOUR) continue;
    n++;
    await push(app, u.user_id, { kind: 'dua', text: ['دعاء الساعة · Invocation', `${ar}\n${fr}`] });
  }
  return n;
}

/** Lance l'envoi à chaque heure pile (+ quelques secondes). Appelé par server.js, pas par les tests. */
export function startDuaScheduler(app, push) {
  const tick = () => sendHourlyDuas(app, new Date(), push).catch((e) => app.log.warn({ err: e?.message }, 'invocation horaire non envoyée'));
  const wait = 3_600_000 - (Date.now() % 3_600_000) + 15_000;
  const first = setTimeout(() => { tick(); setInterval(tick, 3_600_000).unref(); }, wait);
  first.unref();
}
