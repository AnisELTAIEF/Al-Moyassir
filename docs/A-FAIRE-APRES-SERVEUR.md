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

## Rappel
- Dernière version de l'app livrée : 0.17.0 (import de listes d'utilisateurs TXT/CSV, APK téléchargeable sur le serveur).
- Les noms techniques restent inchangés (paquet Android `com.bestconsultingit.hifidh_quran`,
  service `hifidh-api`, base `hifidh`) pour ne rien casser.
