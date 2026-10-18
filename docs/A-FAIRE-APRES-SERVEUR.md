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
- [ ] **Lot A — gains rapides** : langue par défaut arabe (21) · vue « Pages » dans Lire (8) · estimateur de khatma (23) ·
      compléter المسلاتي (20, 53/114 sourates aujourd'hui) · nom de l'app (18) : « حفظ قالون », repli « تحفيظ قالون », à vérifier dans les stores.
- [ ] **Lot B — fondations** *(décisions D1-D20 prises le 17/10 ; voir `PLAN-EXECUTION.md`)* : établissements, classes, rôles إداري/مدرس/طالب,
      fiche élève, journal d'événements de mémorisation, حفظ إجمالي / مسترسل (1-5, 10, 14).
- [ ] **Lot C — validation par l'enseignant** (6-7) : mushaf enseignant, règle des 3 erreurs, notifications dans l'app.
- [ ] **Lot D — BO** (9, 11-13, 15, 16) : mosaïque 604, « متابعة », classements/périodes, exports, BO arabe/français.
- [ ] **Lot E — résultats** (17) : examens, concours, certificats.
- [ ] **Lot F — audio** (19-20) : كمال صميدة, après **accord des récitateurs** (pas de téléchargement YouTube) et production
      des minutages ayah par ayah.
- [ ] **Lot G — alertes app fermée** : push natif + Web Push, mutualisé avec le rappel de prière.
- [ ] **Sauvegardes longue durée** (conservation ≥ 5 ans, copie chiffrée sur le disque virtuel « Backup U » de F:) : dump mensuel + copie chiffrée + test de restauration (lot B7).
- ✅ Déjà fait : création de compte sans invitation (22).

## Rappel
- Dernière version de l'app livrée : 0.17.0 (import de listes d'utilisateurs TXT/CSV, APK téléchargeable sur le serveur).
- Les noms techniques restent inchangés (paquet Android `com.bestconsultingit.hifidh_quran`,
  service `hifidh-api`, base `hifidh`) pour ne rien casser.
