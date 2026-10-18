// Calculs de mémorisation « globale » et « successive » (décision D1) et repères du mushaf.
//
//   - global    : nombre de sourates entières et de ahzab entiers acquis ;
//   - successif : plus longue suite ininterrompue de sourates entières (resp. de ahzab entiers),
//                 dans l'ordre du mushaf. Il est donc toujours ≤ au global de la même unité.
// Une sourate ou un hizb PARTIEL ne compte pas. Les ayat sont repérés par un indice global 0..6213
// (ordre du mushaf de Qalun). Ces fonctions sont pures : elles ne touchent ni la base ni le réseau.

/** Ordonne [{from, to}] (to exclu) en vérifiant qu'ils se suivent sans trou ni chevauchement. */
function ranges(starts, total) {
  return starts.map((from, i) => ({ from, to: i + 1 < starts.length ? starts[i + 1] : total }));
}

/**
 * @param {Map<number, number>|number[]} ayahCounts nombre d'ayat par sourate (clé 1..114)
 * @param {{surah:number, ayah:number}[]} hizbStarts débuts des 60 ahzab, dans l'ordre
 * @param {{surah:number, ayah:number}[]} pageStarts débuts des 604 pages, dans l'ordre
 */
export function buildReference(ayahCounts, hizbStarts, pageStarts = []) {
  const count = (s) => (ayahCounts instanceof Map ? ayahCounts.get(s) : ayahCounts[s]);
  const offset = new Array(116).fill(0); // offset[s] = indice global du 1er ayah de la sourate s
  let total = 0;
  for (let s = 1; s <= 114; s++) {
    offset[s] = total;
    total += count(s);
  }
  const indexOf = (surah, ayah) => {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > count(surah)) {
      throw new RangeError(`Ayah inconnu : ${surah}:${ayah}`);
    }
    return offset[surah] + ayah - 1;
  };
  const startsToRanges = (list) => ranges(list.map((r) => indexOf(r.surah, r.ayah)), total);
  return {
    total,
    indexOf,
    surahRanges: ranges(Array.from({ length: 114 }, (_, i) => offset[i + 1]), total),
    hizbRanges: startsToRanges(hizbStarts),
    pageRanges: startsToRanges(pageStarts),
  };
}

/** Charge les repères depuis la base (tables surahs, hizb_starts, mushaf_pages). */
export async function loadReference(db) {
  const [surahs] = await db.query('SELECT n, ayah_count FROM surahs ORDER BY n');
  const [hizb] = await db.query('SELECT surah, ayah FROM hizb_starts ORDER BY hizb');
  const [pages] = await db.query('SELECT surah, ayah FROM mushaf_pages ORDER BY page');
  return buildReference(new Map(surahs.map((r) => [Number(r.n), Number(r.ayah_count)])), hizb, pages);
}

/** Indicateurs 0/1 par ayah, à partir de couples [sourate, ayah]. */
export function flagsFrom(ref, ayat) {
  const flags = new Uint8Array(ref.total);
  for (const [s, a] of ayat) flags[ref.indexOf(s, a)] = 1;
  return flags;
}

/** Nombre d'unités entièrement acquises, et plus longue suite consécutive d'unités entières. */
function unitStats(unitRanges, prefix) {
  let complete = 0, run = 0, longestRun = 0;
  for (const { from, to } of unitRanges) {
    if (prefix[to] - prefix[from] === to - from) {
      complete++;
      run++;
      if (run > longestRun) longestRun = run;
    } else {
      run = 0;
    }
  }
  return { complete, longestRun };
}

/**
 * @param {Uint8Array} flags 1 = ayah acquis, indexé comme `ref.indexOf`
 * @returns {{ayat:number, surahs:{complete:number,longestRun:number}, ahzab:{complete:number,longestRun:number}}}
 */
export function memorizationStats(ref, flags) {
  const prefix = new Uint32Array(ref.total + 1);
  for (let i = 0; i < ref.total; i++) prefix[i + 1] = prefix[i] + (flags[i] ? 1 : 0);
  return {
    ayat: prefix[ref.total],
    surahs: unitStats(ref.surahRanges, prefix),
    ahzab: unitStats(ref.hizbRanges, prefix),
  };
}
