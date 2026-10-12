# Conception — Hifidh al-Qur'an (v2)

## 1. Objectifs
1. Lire le Coran en riwaya de **Qalun ʿan Nāfiʿ** et l'écouter ayah par ayah (16 récitateurs de cette riwaya).
2. Enregistrer les ayat **appris** / **en cours**, réviser, marquer **une sourate entière** en un geste.
3. Gérer les **utilisateurs sur invitation**, leurs **rôles** (utilisateur / admin), et suivre des **groupes**.
4. Fonctionner sur **tous les téléphones et tablettes Android (7.0+) et iPhone/iPad (iOS 15+)**.
5. Héberger les données sur la **VM Linux existante (MariaDB)**.

## 2. Rôles et droits
| Qui | Peut |
|---|---|
| Sans compte | Lire, écouter, suivre sa mémorisation sur l'appareil |
| Utilisateur (invité) | + synchronisation multi-appareils, appartenance à des groupes |
| Admin de groupe (un ou plusieurs par groupe) | + gérer **son** groupe : ajout par e-mail / invitation, admins du groupe, retrait, renommage, progression des membres |
| Admin global | Tout : tous les groupes, utilisateurs, rôles globaux, invitations, (dés)activation, suppression |

Règles : inscription impossible sans invitation valide (sauf `BOOTSTRAP_ADMIN_EMAIL`) ; une invitation
expire après 14 jours, ne sert qu'une fois, peut être révoquée ; le dernier administrateur actif ne peut
être ni rétrogradé, ni désactivé, ni supprimé ; un compte désactivé perd toutes ses sessions.

## 3. Architecture
```
App Flutter ─┐                      ┌─ Admin web (React, statique)
             ├─ HTTPS ─ Nginx/Apache ┤
             │   /api/* ─────────────┴─> API Node.js (Fastify, 127.0.0.1:8787, systemd)
             │                                 └─> MariaDB (base « hifidh »)
             └─ audio en streaming (mp3quran.net / qalun-timing)
```
- **Authentification** : Google (ID token vérifié côté serveur avec les clés publiques de Google, audience
  limitée aux ID clients configurés) ou e-mail + mot de passe (bcrypt). Sessions : jeton d'accès JWT de
  15 min + jeton de renouvellement de 60 jours, renouvelé à chaque usage ; la réutilisation d'un ancien
  jeton révoque toutes les sessions du compte. Sur téléphone, le jeton de renouvellement est dans le
  stockage sécurisé (Keychain / Keystore).
- **Local d'abord** : la progression est écrite sur l'appareil puis envoyée par lots ; hors ligne, les
  changements attendent et partent à la reconnexion. Conflits : la modification la plus récente gagne.
- **Données embarquées** (3 Mo) : texte, minutages, liste des récitateurs → lecture hors ligne.

## 4. Modèle de données (MariaDB, `server/sql`)
`users` (rôle, statut, google_sub, mot de passe haché) · `invitations` (empreinte SHA-256 du code, rôle,
groupe, expiration) · `refresh_tokens` (empreintes) · `study_groups` · `group_members` (membre / admin du groupe) ·
`memorized_ayahs` (statut, dates, révisions) · `surahs` (114 sourates, nombre d'ayat Qalun, sert à valider
les écritures et à « marquer toute la sourate »).

## 5. API (préfixe `/api` derrière le proxy)
- `POST /auth/google|login|register|refresh|logout`, `GET /auth/invitations/:code`
- `GET|PATCH /me`, `GET|PUT /me/progress`, `POST /me/progress/delete`, `PUT /me/progress/surah/:n`, `GET /me/groups`
- `/groups/:id/…` (admin global ou admin du groupe) : `overview`, `members/:uid/progress`, `PATCH` (renommer),
  `POST members` (ajout par e-mail ou invitation), `PUT|DELETE members/:uid`, `GET|DELETE invitations`
- `/admin/stats|users|invitations|groups…` (admin)
- `GET /invite/:code` : page publique expliquant comment utiliser le code.

## 6. Identité visuelle
Inspirée des mushafs maghrébins : vert zellige `#0D5C4B` (couleur principale), safran `#D9A21B`
(sourate complète, accent), rouge garance `#A93226` (ayat en cours, alertes), encre `#17201F` sur blanc
chaulé `#F5F6F2` ; mode sombre dédié. Typographies : Scheherazade New (texte coranique), Readex Pro
(interface, latin et arabe). Motif : l'étoile à huit branches (khatam) pour les numéros de sourate,
les fins d'ayah et l'icône.
Élément signature : la **mosaïque des 114 sourates** (accueil, admin) qui se colore au fil de la
mémorisation, lue de droite à gauche comme le mushaf.

## 7. Écrans
Mobile : Accueil (salutation, mosaïque, reprendre, à réviser) · Sourates (recherche, filtres, ✓ « sourate
apprise » avec Annuler) · Lecteur (cartouche de sourate, texte justifié avec marqueurs d'ayah, feuille
d'actions par ayah, lecteur audio avec répétition) · Réviser (à réviser / en cours) · Compte (connexion,
code d'invitation, profil, thème, taille du texte, récitateur, licences) · Suivi (admin : Aperçu,
Utilisateurs, Invitations avec partage WhatsApp/e-mail, Groupes ; admin de groupe : ses groupes, ajout par e-mail, invitations en attente).
Tablette : rail de navigation latéral, contenu centré (760 px max).
Web : Aperçu · Utilisateurs (rôle, statut, suppression, export CSV) · Invitations · Groupes (membres,
admins du groupe, ajout par e-mail, invitations en attente) · panneau de progression avec mosaïque.

## 8. Limites connues / à vérifier
- Le texte source contient le caractère U+06D2 (~3000 occurrences, ex. « ٱلذِے ») ; Scheherazade New
  l'affiche comme un yā' barrée. À faire valider par un lecteur de Qalun ; une police maghrébine dédiée
  pourrait être plus fidèle.
- Pas d'envoi d'e-mail automatique des invitations (partage du message par l'admin) ; un SMTP pourrait être ajouté.
- Pas de « Se connecter avec Apple » (probablement exigé pour l'App Store si Google est proposé).
- Pas d'audio hors ligne ni de notifications de révision.
- Interface en français uniquement.
