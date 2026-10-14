// Proxy de géocodage (recherche de ville → coordonnées) via Nominatim / OpenStreetMap.
//
// Pourquoi passer par le serveur plutôt qu'appeler Nominatim depuis l'app web :
//   - Nominatim refuse (403) un User-Agent générique de navigateur ; côté web on ne peut pas
//     changer l'User-Agent. Le serveur, lui, envoie un User-Agent identifiant l'app (exigé par
//     la politique d'usage d'OSM).
//   - On met en cache et on limite le débit (max ~1 req/s) pour respecter cette politique.
//
// Sert aux horaires de prière : trouver sa ville exacte quand le GPS n'est pas précis.

const UA = 'Almoyassir/1.0 (+https://quran.bestconsultingit.com)';
const cache = new Map(); // clé « lang:q » -> { at, results }
const DAY = 24 * 60 * 60 * 1000;
let lastCall = 0;

async function nominatim(q, lang) {
  // Courtoisie : au plus une requête par seconde vers Nominatim.
  const wait = 1000 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows
      .map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function geocodeRoutes(app) {
  app.get('/geocode', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 2, maxLength: 120 },
          lang: { type: 'string', maxLength: 8, default: 'fr' },
        },
      },
    },
  }, async (req, reply) => {
    const q = req.query.q.trim();
    const lang = req.query.lang || 'fr';
    if (q.length < 2) return { results: [] };

    const key = `${lang}:${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < DAY) return { results: hit.results };

    const results = await nominatim(q, lang);
    if (results == null) return reply.code(502).send({ error: 'geocode_unavailable', message: 'Recherche indisponible, réessayez.' });

    cache.set(key, { at: Date.now(), results });
    if (cache.size > 500) cache.delete(cache.keys().next().value); // borne mémoire
    return { results };
  });
}
