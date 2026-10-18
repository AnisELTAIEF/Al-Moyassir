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
| Utilisateur (compte) | + synchronisation multi-appareils, appartenance à des groupes (création de compte libre, sans invitation) |
| Admin de groupe (un ou plusieurs par groupe) | + gérer **son** groupe : ajout par e-mail / invitation, admins du groupe, retrait, renommage, progression des membres |
| Admin global | Tout : tous les groupes, utilisateurs, rôles globaux, invitations, (dés)activation, suppression |

Règles : **l'inscription est ouverte** (commit 477009e) : toute personne peut créer un compte pour ne pas
perdre sa progression en changeant d'appareil ; une invitation sert seulement à **affecter un rôle ou un groupe**
(14 jours, usage unique, révocable) ; l'adhésion à un groupe par code peut être activée/désactivée par l'admin
(`join_open`, activée par défaut) ; mot de passe oublié : l'admin génère un code de réinitialisation à durée limitée
(7 jours) ; le dernier administrateur actif ne peut être ni rétrogradé, ni désactivé, ni supprimé ; un compte
désactivé perd toutes ses sessions.

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
- Audio hors ligne : disponible sur Android uniquement (pas sur la version web). Pas encore de notifications de
  révision ni de rappel de prière **quand l'app est fermée** (rappel in-app seulement ; Web Push / push natif à prévoir).
- Interface : application en **français et arabe** ; **BO en français uniquement** (arabe prévu, voir §9).
- Horaires de prière : calcul local (paquet `adhan`), lieu par GPS ou recherche de ville (`/geocode`).

## 9. Évolutions prévues (réunion 1, 17/10/2026)
Analyse complète, état de chaque demande, questions ouvertes et ordre de réalisation :
**`docs/EVOLUTIONS-REUNION-1.md`**. Résumé de la cible :
- **Établissements** (`organizations` : association ou mosquée, avec adresse) → **classes** (salles/fawj/halaqat,
  c'est-à-dire les `study_groups` rattachés à un établissement) → membres avec rôle **إداري / مدرس / طالب** (par établissement).
- **Fiche élève** (`student_profiles`) : identité, prénom du père, date de naissance, sexe, dates d'adhésion et de début
  de hifdh, concours passés ; **calculés** : حفظ إجمالي, حفظ مسترسل (toujours ≤ إجمالي), rang.
- **Validation par l'enseignant** : table `validations` (par ayah : acquis / acquis avec erreur / à revoir) ;
  règle de page « ≥ 3 ayat avec erreur → page à reprendre » ; propagation au mushaf de l'élève avec une marque distincte
  du rouge d'auto-marquage ; notification à l'élève.
- **Décisions (17/10/2026)** : successif (مسترسل) compté en **ahzab entiers et sourates entières** ; le marquage de
  l'enseignant **fait foi** (rapports + mushaf de l'élève) tandis que l'élève garde une **marque « à réviser » personnelle**
  distincte (canal visuel différent : fond = enseignant, médaillon du numéro d'ayah = élève) ; téléphone vérifié par **code WhatsApp**
  (phase 1 : lien `wa.me` pré-rempli ; phase 2 : WhatsApp Business Cloud API).
- **Autres décisions (réponses du 17/10/2026)** : seuil de **3 erreurs par page**, réglable par association ; une personne peut
  appartenir à **plusieurs établissements** (rôles par établissement) et un élève à plusieurs classes ; association et mosquée =
  **mêmes écrans** (libellés différents) ; **classements réservés à l'équipe** ; exports **Excel et Word** ; **certificats**
  téléversés par l'administratif avec notification et historique ; vue **Pages par défaut** pour tous (marquage par page ou par ayah) ;
  **BO arabe par défaut** ; MP3 des nouveaux récitateurs **hébergés sur notre serveur** (accord des récitateurs acquis).
- **Décisions complémentaires** : consentement parental recueilli à l'inscription et tracé ; identifiant élève = clé technique interne +
  alerte de doublon ; marque personnelle « à réviser » **privée** (invisible de l'enseignant) ; nom d'affichage visé « حفظ قالون »
  (repli « تحفيظ قالون ») ; profil élève sans e-mail obligatoire, rattaché au compte créé par le parent via un code de liaison.
- **Élèves d'élite et conservation** : récompenses = message d'encouragement + certificat + cadeau (suivi de remise) ; classements jamais visibles
  des élèves ; données d'un élève sorti **conservées 5 ans au moins** (archivage, purge manuelle) avec **sauvegardes longue durée** et copie hors site.
- **Réalisé (0.20.0)** : la validation de l'enseignant est stockée à part de l'auto-marquage (`validations` = journal, `validation_state` = dernier état par ayah ;
  `notifications`). Rendu : le **fond** montre la validation de l'enseignant, l'**anneau** du médaillon la marque personnelle de l'élève (jamais exposée à l'équipe).
- **Journal d'événements de mémorisation** (append-only) : indispensable aux rapports par mois/trimestre/semestre/année,
  au rythme de hifdh et aux classements (l'actuel `memorized_ayahs` ne garde que la dernière date).
- **Résultats** (`assessments`) : examens/concours, date, note, certificat.
- **BO** : mosaïque de **604 pages** (en plus des 114 sourates), rubrique « متابعة », classements, exports, **arabe/français**.
- **App** : vue « Pages » dans Lire, estimateur de durée de la khatma, arabe par défaut, nouveaux récitateurs (sous réserve
  d'accord des ayants droit et de minutages ayah par ayah), nouveau nom d'affichage.
