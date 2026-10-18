# Almoyassir — الميسّر (ex-Hifidh al-Qur'an) — contexte pour Claude Code

- `mobile/` : app Flutter (Android/iOS). `flutter analyze && flutter test`.
- `server/` : API Node.js 20+ (Fastify) + MariaDB. `npm test` nécessite une base MariaDB de test vide
  (variables `TEST_DB_HOST`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`).
- `admin/` : admin web React/Vite. `npm test && npm run build`.
- `deploy/` : déploiement sur la VM Linux existante (MariaDB + Nginx/Apache).
  **Pour déployer, suivre `deploy/CLAUDE.md` à la lettre** (ne jamais toucher au site Best CIT existant).
- Numérotation des versets : Qalun (mushaf Awqaf libyen), 6214 ayat — pas la numérotation Hafs.
- Administrateur par défaut : anis.eltaief@gmail.com (variable `BOOTSTRAP_ADMIN_EMAIL`).
- Après le déploiement du serveur : `docs/A-FAIRE-APRES-SERVEUR.md` (améliorations validées, dans l'ordre).
- Mettre à jour le serveur après un `git pull` : `docs/MISE-A-JOUR-SERVEUR.md`.
- Évolutions demandées (réunion 1, établissements/enseignants/rapports…) : `docs/EVOLUTIONS-REUNION-1.md` ; plan d'exécution par lots : `docs/PLAN-EXECUTION.md`.
- IP publique dynamique (DuckDNS + Cloudflare) : `docs/IP-DYNAMIQUE-DUCKDNS.md`.
