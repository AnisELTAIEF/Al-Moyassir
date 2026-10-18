# À faire juste après la mise en service du serveur (VM)

Liste validée par Anis le 12/10/2026 : à traiter **dans cet ordre**, une fois l'API en ligne
(`https://DOMAINE/api/health` répond `{"ok":true}`) et le premier compte administrateur créé.

## 0. Vérifications liées au serveur (immédiatement)
- [ ] Dans l'app : Accueil → « Créer un compte ou se connecter » → renseigner `https://DOMAINE/api`,
      tester, créer le compte administrateur (anis.eltaief@gmail.com).
- [ ] Vérifier la synchronisation du marquage « à revoir » (migration 004, version 0.7.0+) :
      marquer un ayah « à revoir » sur un téléphone, le retrouver sur un autre appareil.
- [ ] Vérifier le texte des invitations (nouveau nom « Almoyassir (الميسّر) ») et la page `/invite/CODE`.
- [ ] Sauvegarde quotidienne en place (`/var/backups/hifidh`).

## 1. Garder l'écran allumé pendant la lecture et la récitation — FAIT (0.11.0)
- Ajouter le paquet `wakelock_plus` (vérifier la version actuelle sur pub.dev) ; l'activer dans le
  lecteur quand l'audio joue ou que l'écran de lecture est ouvert, le relâcher en sortant.

## 2. Audio disponible hors ligne — FAIT (0.11.0, Android ; pas sur la version web)
- Mettre en cache les fichiers audio écoutés (ou téléchargement d'une sourate entière) pour réécouter
  sans connexion ; afficher la place occupée et un bouton pour vider le cache.
- Vérifier la licence de redistribution des enregistrements avant tout téléchargement en masse.

## 3. Rappel quotidien de révision
- Notification locale à l'heure choisie (« N ayat à réviser aujourd'hui »), désactivable.
- Paquet à évaluer : `flutter_local_notifications` (vérifier la version et les permissions Android 13+).

## 4. Publication sur Google Play
- Créer la vraie clé de signature (ne jamais la committer ; `key.properties` hors dépôt).
- Ajouter l'empreinte SHA-1 dans Google Cloud (connexion Google) et dans la Play Console.
- Vérifier les conditions d'utilisation du texte d'Ibn Kathir (version numérisée de quran.com) et
  des enregistrements audio ; rédiger la politique de confidentialité (comptes, progression).
- Fiche Play : nom « Almoyassir — الميسّر », captures d'écran, catégorie Éducation/Livres.

## 5. App iPhone native (plus tard, si besoin)
- En attendant : version web sur `https://quran.bestconsultingit.com/app/` (0.12.0), à ajouter à
  l'écran d'accueil depuis Safari. Limites : pas d'audio hors ligne, pas de connexion Google,
  l'écoute peut s'arrêter quand l'écran se verrouille (à vérifier sur iPhone).
- Pour une vraie app iPhone : compte Apple Developer (payant, à vérifier sur developer.apple.com),
  compilation sur un Mac (ou service de build macOS), distribution TestFlight puis App Store.
  Le projet `mobile/ios` existe déjà (identifiant `com.bestconsultingit.hifidhQuran`).

## 6. Évolutions issues de la réunion 1 (17/10/2026)
Analyse, décisions (D1-D20) et questions restantes : **`docs/EVOLUTIONS-REUNION-1.md`**. Plan d'exécution détaillé (tâches, schéma SQL,
API, critères d'acceptation, ordre de démarrage) : **`docs/PLAN-EXECUTION.md`**.
Ordre proposé (chaque lot est indépendant du suivant, sauf mention) :
- [x] **Lot A — gains rapides** : livré en **0.18.0** (18/10/2026) — langue arabe par défaut (21), onglet « Pages » par défaut + marquage page par page (8),
      estimateur de khatma (23). **Reste du lot A**, en attente d'éléments externes : A5/A6 (récitateurs كمال صميدة et المسلاتي : MP3 à fournir par Anis,
      puis lecture « sourate entière », hébergement `/audio/`) · A7 (nom « حفظ قالون » : disponibilité à vérifier dans les stores).
- [x] **Lot B — fondations** : livré en **0.19.0** (18/10/2026) — établissements (association/mosquée), classes, rôles إداري/مدرس/طالب par établissement,
      fiche élève (consentement, doublons, téléphone vérifié par code, code de liaison du compte, archivage 5 ans), calculs global/successif en ahzab et sourates,
      BO « Établissements », écran « Mes établissements » dans l'app.
      **Reste du lot B** : **B7** disque « Backup U » + sauvegardes longue durée · le **résumé حفظ إجمالي / مسترسل** d'un élève et le **journal d'événements**
      (rythme, périodes) viennent avec le lot C, car ils comptent les validations de l'enseignant (D2).
- [x] **Lot C — validation par l'enseignant** : livré en **0.20.0** (18/10/2026) — séance de validation dans l'app (toucher = acquis → avec erreur → à revoir → effacé, ou page entière), règle de la page à reprendre (seuil par association), couche « enseignant » dans le mushaf de l'élève (marque personnelle en anneau sur le médaillon), notifications dans l'app, synthèse en ahzab/sourates dans le BO. Hypothèses à confirmer : `EVOLUTIONS-REUNION-1.md` §4 (18-20).
- [x] **Lot D — BO** : livré en **0.21.0** — onglet « Suivi (متابعة) » (classement par classe/établissement, périodes mois/trimestre/semestre/année, élèves d'élite, export **Excel et Word**),
      fiche élève : carte **604 pages / 114 sourates**, rythme sur 12 semaines, encouragements (message, cadeau), BO **bilingue arabe (par défaut) / français**.
      **Reste** : traduire en arabe les anciennes pages (Aperçu, Utilisateurs, Invitations, Groupes, Import, Connexion) — elles s'affichent encore en français ; cases « 604 » sur l'Aperçu global ;
      exports d'autres rapports que le classement ; adaptation fine du CSS en lecture droite-gauche.
- [x] **Lot E — résultats** : livré en **0.21.0** — examens/concours, certificats téléversés par l'administratif (PDF/PNG/JPEG ≤ 5 Mo, type vérifié sur le contenu, stockés hors base, lien de 5 min), notification à l'élève, historique complet côté app (« Résultats et certificats »). **Reste** : sauvegarde du dossier des certificats (B7), génération automatique de certificats (non demandée), aperçu intégré du PDF.
- [ ] **Lot F — audio** (19-20) : كمال صميدة, après **accord des récitateurs** (pas de téléchargement YouTube) et production
      des minutages ayah par ayah.
- [~] **Lot G — alertes app fermée** : **Web Push livré en 0.21.0** (version web / PWA : service worker dédié, abonnement par l'élève, alertes à la validation, au certificat, aux encouragements ; clés VAPID générées sur le serveur). **Alertes natives Android livrées en 0.22.0** (Firebase Cloud Messaging, migration 014, compte de service sur le serveur : `docs/MISE-A-JOUR-SERVEUR.md`). **Reste** : alertes natives **iOS** (GoogleService-Info.plist + clé APNs), **rappel de prière app fermée** (le serveur devrait connaître le lieu et la méthode de chaque utilisateur), iPhone : PWA installée sur l'écran d'accueil (iOS ≥ 16.4).
- [ ] **Sauvegardes longue durée** (conservation ≥ 5 ans, copie chiffrée sur le disque virtuel « Backup U » de F:) : dump mensuel + copie chiffrée + test de restauration (lot B7).
- ✅ Déjà fait : création de compte sans invitation (22).

## Rappel
- Dernière version de l'app livrée : 0.17.0 (import de listes d'utilisateurs TXT/CSV, APK téléchargeable sur le serveur).
- Les noms techniques restent inchangés (paquet Android `com.bestconsultingit.hifidh_quran`,
  service `hifidh-api`, base `hifidh`) pour ne rien casser.
