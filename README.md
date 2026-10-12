# Hifidh al-Qur'an — حِفْظُ القُرْآن

Application mobile (Android et iPhone) pour **lire le Coran en riwaya de Qalun ʿan Nāfiʿ**, **l'écouter
ayah par ayah** (16 récitateurs) et **suivre sa mémorisation** ; avec une **administration** (dans l'app
et sur le web) pour gérer les utilisateurs **sur invitation**, leurs **rôles** et suivre des **groupes**.

| Dossier | Contenu |
|---|---|
| `mobile/` | App Flutter (Android 7+ / iOS 15+, téléphones et tablettes) |
| `server/` | API Node.js + **MariaDB** (comptes, Google, invitations, rôles, groupes, progression) |
| `admin/` | Admin web (React) : aperçu, utilisateurs, invitations, groupes |
| `deploy/` | Déploiement sur la VM Linux — **`deploy/CLAUDE.md` est le guide à donner à Claude Code** |
| `tools/build_data.py` | Régénère le texte, les minutages et la table des sourates |
| `docs/CONCEPTION.md` | Conception détaillée |

## Comptes et rôles
- **Accès sur invitation** : un administrateur invite une adresse e-mail (rôle *utilisateur* ou *admin*,
  groupe facultatif). L'invité saisit le code (ex. `K7XQ-M2PA`) dans l'app, ou se connecte simplement
  avec Google si c'est la même adresse. Sans invitation, aucun compte ne peut être créé.
- **anis.eltaief@gmail.com est administrateur d'office** (créé à sa première connexion).
- **Rôles** :
  - *admin global* : gère tous les groupes, les utilisateurs, les rôles et les invitations ;
  - *admin de groupe* (un ou plusieurs par groupe) : ajoute des membres à **son** groupe par e-mail
    (compte existant → ajout immédiat, sinon code d'invitation), nomme d'autres admins du groupe,
    retire des membres, renomme le groupe et suit la progression de tous ses membres ;
  - *membre* : lit, mémorise ; peut appartenir à plusieurs groupes et en quitter un.
  Un groupe garde toujours au moins un admin de groupe (seul un admin global peut passer outre).
- Garde-fous : impossible de retirer ou désactiver le dernier administrateur ; un compte désactivé
  est déconnecté de tous ses appareils immédiatement.
- La lecture et l'écoute restent possibles **sans compte** (progression gardée sur le téléphone ;
  elle est reprise automatiquement à la première connexion).

## Démarrage

### 1. Serveur sur la VM
Ouvrir Claude Code dans le dossier du projet sur la VM et lui demander :
« Déploie Hifidh en suivant deploy/CLAUDE.md ». Le domaine (ex. `quran.bestconsultingit.com`) reste à choisir.

### 2. App mobile
```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=API_URL=https://DOMAINE/api \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<ID client OAuth « Web »> \
  --dart-define=GOOGLE_IOS_CLIENT_ID=<ID client OAuth « iOS »>
```
Sans `API_URL`, l'app démarre en mode local ; l'adresse du serveur peut aussi être saisie dans l'app
(Compte et réglages → Serveur), ce qui permet d'utiliser la même APK de test avant et après le déploiement.

**Mode sombre** : bouton soleil/lune sur l'accueil (et dans le menu du lecteur), ou Compte et réglages →
Affichage (Auto / Clair / Sombre). L'admin web a le même bouton.

**Publication Android** : créer une clé (`keytool -genkey -v -keystore hifidh.jks -keyalg RSA -keysize 2048 -validity 10000 -alias hifidh`),
puis `mobile/android/key.properties` :
```
storePassword=...
keyPassword=...
keyAlias=hifidh
storeFile=/chemin/vers/hifidh.jks
```
et `flutter build appbundle --dart-define=...` (fichier `.aab` pour Google Play) ou
`flutter build apk --split-per-abi --dart-define=...` (installation directe).

**Publication iPhone** : nécessite un Mac avec Xcode (ou un service de build macOS dans le cloud)
et un compte Apple Developer. Remplacer `REMPLACER-PAR-ID-CLIENT-IOS` dans `ios/Runner/Info.plist`,
puis `flutter build ipa --dart-define=...`. ⚠️ L'App Store peut exiger « Se connecter avec Apple »
dès qu'une connexion Google est proposée : à vérifier dans les règles Apple en vigueur avant soumission.

Icône : `dart run flutter_launcher_icons` (source : `assets/icon/`).

### 3. Admin web (développement)
```bash
cd admin && cp .env.example .env.local   # VITE_API_URL=https://DOMAINE/api
npm install && npm run dev               # aperçu sans serveur : VITE_DEMO=1 npm run dev
```
En production, `deploy/install.sh` construit et publie l'admin.

## Vérifications automatiques
- `server` : `npm test` — 15 tests d'intégration sur une vraie base MariaDB (invitations, Google simulé,
  rôles, admins de groupe, dernier admin, sessions, progression, sourate entière).
- `mobile` : `flutter analyze && flutter test` — 15 tests (données Qalun, synchro, annulation, client API).
- `admin` : `npm test && npm run build`.

## Données, sources et licences — à lire avant toute publication
- **Texte** : مصحف الأوقاف الليبية برواية قالون (6214 ayat), repris du projet
  [qalun-timing](https://github.com/Jawad18750/qalun-timing). Selon ce projet : gratuit pour un usage non
  commercial, usage commercial soumis à l'autorisation du ministère libyen des Awqaf. **Non vérifié à la source.**
- **Minutages** : Abdeljawad Almiladi, qalun-timing.abdeljawad.com — CC BY 4.0 (mention dans l'app).
- **Audio** : non inclus, lu en streaming (mp3quran.net et hébergement du projet qalun-timing). Les
  enregistrements appartiennent à leurs éditeurs ; pour une diffusion publique, prévoir un accord ou votre
  propre hébergement.
- **Polices** : Scheherazade New et Readex Pro (licence OFL, fichiers dans `mobile/assets/fonts`).
