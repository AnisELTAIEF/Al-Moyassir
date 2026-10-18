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
  /** Inverse de indexOf : indice global → [sourate, ayah]. */
  const refAt = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= total) throw new RangeError(`Indice hors du Coran : ${index}`);
    let lo = 1, hi = 114;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offset[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return [lo, index - offset[lo] + 1];
  };
  return {
    total,
    indexOf,
    refAt,
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

// ───────────────────────── Validation par l'enseignant (lot C) ─────────────────────────
//
// Chaque ayah porte, au plus, un résultat posé par l'enseignant :
//   1 = acquis · 2 = acquis avec erreur · 3 = à revoir · 0 = rien.
// Règle de page (D4) : à partir de `threshold` ayat « acquis avec erreur » sur la MÊME page, toute la page est
// « à reprendre » ; aucun de ses ayat n'est alors compté comme acquis (il faut la refaire entièrement).

export const RESULT_CODE = { acquired: 1, acquired_error: 2, review: 3 };
export const CODE_RESULT = [null, 'acquired', 'acquired_error', 'review'];

/** Pages (1..604) « à reprendre » : au moins `threshold` ayat acquis avec erreur sur la page. */
export function retakePages(ref, codes, threshold) {
  const out = [];
  ref.pageRanges.forEach(({ from, to }, i) => {
    let errors = 0;
    for (let k = from; k < to; k++) if (codes[k] === 2) errors++;
    if (errors >= threshold) out.push(i + 1);
  });
  return out;
}

/** 'retake' (à reprendre) · 'complete' (tous acquis) · 'partial' (validation en cours, ou ayat à revoir) · 'none'. */
export function pageStatus(ref, codes, page, threshold) {
  const { from, to } = ref.pageRanges[page - 1];
  let errors = 0, acquired = 0, any = 0;
  for (let k = from; k < to; k++) {
    if (codes[k] === 2) errors++;
    if (codes[k] === 1 || codes[k] === 2) acquired++;
    if (codes[k] !== 0) any++;
  }
  if (errors >= threshold) return 'retake';
  if (acquired === to - from) return 'complete';
  return any ? 'partial' : 'none';
}

/** Carte de la mémorisation pour le BO : une lettre par page (604) et par sourate (114). n = rien · p = en cours · c = complet · r = à reprendre. */
export function coverageMaps(ref, codes, threshold) {
  const LETTER = { none: 'n', partial: 'p', complete: 'c', retake: 'r' };
  const pages = ref.pageRanges.map((_, i) => LETTER[pageStatus(ref, codes, i + 1, threshold)]).join('');
  const flags = acquiredFlags(ref, codes, threshold);
  const surahs = ref.surahRanges.map(({ from, to }) => {
    let acquired = 0, any = 0;
    for (let k = from; k < to; k++) { acquired += flags[k]; if (codes[k]) any++; }
    return acquired === to - from ? 'c' : any ? 'p' : 'n';
  }).join('');
  return { pages, surahs };
}

/** Ayat comptés comme acquis dans les rapports : acquis ou acquis avec erreur, hors pages à reprendre. */
export function acquiredFlags(ref, codes, threshold) {
  const flags = new Uint8Array(ref.total);
  const retake = new Set(retakePages(ref, codes, threshold));
  ref.pageRanges.forEach(({ from, to }, i) => {
    if (retake.has(i + 1)) return;
    for (let k = from; k < to; k++) if (codes[k] === 1 || codes[k] === 2) flags[k] = 1;
  });
  return flags;
}
