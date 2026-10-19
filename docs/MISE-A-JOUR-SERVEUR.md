# Mettre à jour le serveur (API + admin web + version web iPhone)

À faire sur le serveur Ubuntu après chaque nouvelle version poussée sur GitHub
(`github.com/AnisELTAIEF/Al-Moyassir`). Durée : 2 à 5 minutes. Les données (comptes, groupes,
progression) sont conservées.

## 1. Récupérer la nouvelle version

```bash
cd /home/anis/repo/Al-Moyassir/Al-Moyassir
git status --short        # doit être vide ; sinon voir « En cas de problème »
git pull
```

## 2. Sauvegarder la base (recommandé avant une migration)

```bash
sudo /usr/local/bin/hifidh-backup && ls -lh /var/backups/hifidh | tail -3
```

## 3. Installer

```bash
sudo ADMIN_API_URL=https://quran.bestconsultingit.com/api bash deploy/install.sh
sudo chown -R anis:anis /home/anis/repo/Al-Moyassir/Al-Moyassir   # rendre le dépôt à anis
```

Le script (idempotent) :
- copie l'API dans `/opt/hifidh/server` et installe ses dépendances ;
- applique les **migrations SQL** nouvelles (`server/sql/NNN_*.sql`, celles déjà faites sont ignorées) ;
- redémarre le service `hifidh-api` et vérifie `/health` (« ← API OK ») ;
- reconstruit l'**admin web** et le publie dans `/var/www/hifidh-admin` ;
- publie la **version web de l'app** (iPhone, iPad, navigateur), déjà compilée dans `webapp/`,
  dans `/var/www/almoyassir-app/app` → `https://quran.bestconsultingit.com/app/`.

### Une seule fois : activer la version web dans nginx (version 0.12.0)

```bash
sudo bash deploy/enable-webapp.sh
```

Le script sauvegarde `/etc/nginx/sites-available/hifidh`, y ajoute la ligne
`include /etc/nginx/snippets/almoyassir-app.conf;` (juste avant `location /api/`), teste avec
`nginx -t` puis recharge (`reload`, jamais `restart`). Si le test échoue, il restaure la sauvegarde.
Aucun autre site n'est touché. Les fois suivantes, `install.sh` suffit (il dit « Déjà activé »
ou recharge nginx seulement si le fichier `/app/` a changé).

Si la connexion Google est configurée pour l'admin web, ajouter `ADMIN_GOOGLE_CLIENT_ID=<id client Web>`
à la commande.

## 4. Vérifier

```bash
systemctl status hifidh-api --no-pager | head -5
curl -s https://quran.bestconsultingit.com/api/health          # {"ok":true}
journalctl -u hifidh-api -n 30 --no-pager                       # en cas d'erreur
```

curl -sI https://quran.bestconsultingit.com/app/ | head -1        # HTTP/1.1 200 OK (version web)
```

Puis ouvrir `https://quran.bestconsultingit.com` (admin web) et recharger la page (Ctrl+F5),
et `https://quran.bestconsultingit.com/app/` (version web de l'app).

## En cas de problème

| Symptôme | Que faire |
|---|---|
| `git status` montre des fichiers modifiés | Modifications faites sur le serveur : `git diff` pour les voir ; les pousser depuis le serveur ou les annuler (`git restore <fichier>`) avant `git pull`. |
| `git pull` signale un conflit | Ne rien forcer : demander à Claude Code sur le serveur de le résoudre. |
| « Migration » en erreur | Rien n'est perdu : lire le message, restaurer si besoin la sauvegarde de l'étape 2 (`gunzip -c fichier.sql.gz \| mariadb -u hifidh -p hifidh`). |
| API qui ne redémarre pas | `journalctl -u hifidh-api -n 50 --no-pager` ; vérifier `/etc/hifidh/api.env`. |
| Admin web inchangé | Vider le cache du navigateur (Ctrl+F5). |
| `/app/` renvoie l'admin web ou 404 | La version web n'est pas activée : `sudo bash deploy/enable-webapp.sh`. |
| `/app/` : erreur 403/500 | Droits : `sudo chmod -R a+rX /var/www/almoyassir-app` ; voir `sudo tail /var/log/nginx/error.log`. |

## Historique des mises à jour nécessitant le serveur

| Version app | Ce que la mise à jour serveur apporte |
|---|---|
| 0.7.0 | Migration 004 : marquage « à revoir » synchronisé |
| 0.9.0 | Nouveau nom « Almoyassir (الميسّر) » dans les invitations et l'admin web |
| 0.10.0 | Migration 005 : **code de groupe** (6 caractères), inscription avec un seul code, « Rejoindre un groupe » |
| 0.11.0 | Rien côté serveur (app Android uniquement) |
| 0.12.0 | **Version web pour iPhone** sur `/app/` (une fois : `deploy/enable-webapp.sh`) ; lien iPhone dans les invitations |
| 0.14.0 | Migrations 006 et 007 (groupe ouvert, réinitialisation du mot de passe) ; prière, géocodage |
| 0.15.0 | Géocodage inverse `/geocode/reverse` (nom du lieu détecté, ex. « Monastir, Tunisie ») — pas de migration |
| 0.16.0 | E-mails d’invitation détaillés selon le rôle ; envoi automatique **optionnel** (SMTP, voir ci-dessous) ; guide `/guide/` publié avec l’admin web. Nouvelle dépendance `nodemailer` (installée par `install.sh`) |
| 0.17.0 | Import de listes d’utilisateurs (TXT/CSV, par groupe ou général) ; APK Android hébergé sur le serveur (`/api/download/android`). **Migration 008** (appliquée par `install.sh`) ; `install.sh` crée `/var/lib/hifidh/download` |
| 0.22.0 | **Alertes natives de l’app Android** (Firebase Cloud Messaging). **Migration 014** (appliquée par `install.sh`) ; compte de service Firebase à installer une fois (voir ci-dessous) |
| 0.23.0 | Notifications détaillées (sourate, ayat, nombre ; sourate des pages à reprendre) ; app : « Réviser » reprend ce que l'enseignant demande, vue combinée du mushaf. Pas de migration |
| 0.24.0 | Les alertes portent la notification à ouvrir (toucher → l'app l'ouvre directement) ; app : « Aller à » page/sourate/juz pour l'enseignant, raccourci « Valider la mémorisation » sur l'accueil, correction du marquage de l'ayah voisin, mise à jour instantanée app ouverte. Pas de migration |
| 0.25.0 | App : récitateurs Kamel Smida et Nour Eddine Al-Mesallati (khatma complète), sourate entière sans suivi des ayat ; nginx : emplacement `/audio/` (installé par `install.sh`). Publier les fichiers : section « Enregistrements de nos récitateurs ». Pas de migration |
| 0.26.0 | App : Kamel Smida complet (104 sourates), « Votre khatma » au choix en 114 sourates ou 604 pages, les messages avec « Annuler » disparaissent après quelques secondes. Pas de migration |
| 0.27.0 | App : invitation sur l'accueil à activer les alertes dans la barre de notifications (écartable). Pas de migration. E-mails : voir « E-mails qui ne partent pas » (SMTP AUTH désactivé côté Microsoft 365) |
| 0.27.1 | Admin web : validation de la mémorisation depuis la fiche d'un élève (ayah par ayah, sourate entière, page du mushaf). Aucun changement serveur ni migration |
| 0.28.0 | « Hifdh global / successif » et étiquette « ضمن النخبة » dans le suivi ; autorisation des parents non exigée après 14 ans ; plusieurs enfants sur un compte de parent ; invocation de l'heure (facultative) dans la barre de notifications ; du‘â’ al-qunût, sayyid al-istighfâr et Nom suprême ; horaires de prière (méthode Tunisie + ajustements) ; connexion Google sur la version web ; couleurs « acquis avec erreur » / « à revoir » inversées. **Migrations 015 et 016** (appliquées par `install.sh` : faire d'abord `sudo /usr/local/bin/hifidh-backup`) |
| 0.28.1 | App : horaires de prière alignés sur le calendrier officiel tunisien (Dhuhr +7 min, Maghrib +2 min) ; bouton « Activer » des alertes visible sur Android avant la première demande ; barre du bas de la validation lisible sur téléphone. Webapp reconstruite ; aucun changement serveur ni migration |
| 0.28.2 | App Android : autorisation des notifications demandée au premier lancement, alertes activées d'elles-mêmes une fois connecté (sauf si l'utilisateur les a coupées) ; la cloche indique quand le serveur n'est pas configuré pour les alertes (`FCM_SERVICE_ACCOUNT_FILE`, clés VAPID). Aucun changement serveur ni migration |
| 0.28.0 (serveur) | Le lien Android sert automatiquement le dernier .apk déposé dans le dossier ; Compte existant invité : rien n'est recréé (même mot de passe, même progression), le rôle est appliqué et un e-mail « nouveau rôle » est envoyé ; e-mail d'invitation actualisé (Google, alertes). Serveur seul : `install.sh` suffit |

## Mettre à jour la version web (côté développement)

La version web est compilée hors du serveur (le serveur n'a pas besoin de Flutter) :
`bash tools/build-webapp.sh` régénère `webapp/`, à pousser sur GitHub avec le reste.
Sur le serveur, `git pull` + `install.sh` la publient. Les utilisateurs iPhone reçoivent la nouvelle
version à la prochaine ouverture de l'app (pas de mise à jour à installer).

## Envoi automatique des e-mails d’invitation (optionnel, 0.16.0)

Par défaut, l’admin copie le message d’invitation (ou l’ouvre dans sa messagerie). Pour que
l’invité **reçoive l’e-mail automatiquement**, ajouter dans `/etc/hifidh/api.env` (jamais dans
le dépôt) :

```bash
sudo cp /etc/hifidh/api.env /etc/hifidh/api.env.bak.$(date +%F)
sudo nano /etc/hifidh/api.env      # ajouter SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM
sudo systemctl restart hifidh-api   # service de l'app uniquement (pas nginx)
```

Voir `deploy/api.env.example` pour le détail. Avec Microsoft 365 (`smtp.office365.com`, port 587),
la boîte d’envoi doit avoir l’« envoi SMTP authentifié » autorisé ; Microsoft fait évoluer la
prise en charge de l’authentification de base pour SMTP AUTH : **vérifier la situation actuelle
de votre tenant** avant de choisir cette option (sinon : un service d’e-mail transactionnel, ou
une boîte dédiée avec mot de passe d’application).

Test : créer une invitation pour sa propre adresse ; l’admin web affiche « ✓ E-mail d’invitation
envoyé ». En cas d’échec : `journalctl -u hifidh-api -n 30 --no-pager` (ligne « envoi de l’e-mail
impossible », sans mot de passe).

`ANDROID_APK_URL` (optionnel) : lien de téléchargement de l’APK, ajouté aux e-mails.

## Alertes de l’app Android (Firebase, 0.22.0)

Le serveur envoie les alertes « app fermée » aux téléphones Android via Firebase (projet
`easy-taxi-161906`, app `com.bestconsultingit.hifidh_quran`). Il lui faut le **fichier JSON du compte
de service** (console Firebase → Paramètres du projet → Comptes de service → « Générer une nouvelle
clé privée »). Ce fichier donne le droit d’envoyer des notifications : **jamais dans Git**, jamais par e-mail.

Depuis le PC (PowerShell) :

```powershell
scp .irebase-service-account.json anis@SERVEUR:/tmp/firebase.json
```

Sur le serveur :

```bash
sudo install -o root -g hifidh -m 640 /tmp/firebase.json /etc/hifidh/firebase-service-account.json && rm /tmp/firebase.json
sudo cp /etc/hifidh/api.env /etc/hifidh/api.env.bak.$(date +%F)
echo 'FCM_SERVICE_ACCOUNT_FILE=/etc/hifidh/firebase-service-account.json' | sudo tee -a /etc/hifidh/api.env
sudo systemctl restart hifidh-api   # service de l'app uniquement (pas nginx)
journalctl -u hifidh-api -n 20 --no-pager   # aucune ligne « compte de service Firebase illisible »
```

Test : dans l’app Android 0.22.0, ouvrir les notifications (cloche) → activer « Alertes quand l’app est
fermée » (Android demande l’autorisation) ; fermer l’app ; depuis un compte enseignant, signaler une page
à reprendre pour cet élève : la notification arrive sur le téléphone.
L’APK doit être signé avec la clé de publication (`mobile/android/key.properties`), dont les empreintes
SHA-1/SHA-256 sont déclarées dans la console Firebase.

## Publier l’APK Android sur le serveur (0.17.0)

L’APK est servi par l’API à l’adresse `https://quran.bestconsultingit.com/api/download/android`
(aucune modification nginx : `/api/` est déjà relayé). Dès que le fichier est présent, ce lien
apparaît automatiquement dans les e-mails d’invitation, sur la page `/invite/CODE` et dans le guide.

Depuis le PC (PowerShell), copier l’APK sur le serveur :

```powershell
scp .\Almoyassir-0.17.0-arm64.apk anis@SERVEUR:/tmp/
```

**Automatique (depuis 0.28.0)** : le lien sert toujours le fichier `.apk` le plus récemment ajouté
dans `/var/lib/hifidh/download/`, quel que soit son nom (ex. `Almoyassir-0.28.0-arm64.apk`). Il suffit
de déposer le nouvel APK ; les anciens restent dans le dossier (à supprimer à la main si besoin).

Puis sur le serveur (pas de redémarrage nécessaire) :

```bash
sudo install -d -m 755 -o root -g hifidh /var/lib/hifidh/download   # déjà fait par install.sh
sudo install -m 644 /tmp/Almoyassir-0.17.0-arm64.apk /var/lib/hifidh/download/
rm /tmp/Almoyassir-0.17.0-arm64.apk
curl -sI https://quran.bestconsultingit.com/api/download/android | head -n 5   # 200 + application/vnd.android.package-archive
```

À chaque nouvelle version : refaire ces deux commandes (le lien ne change pas).
Pour utiliser un autre lien à la place (Google Drive…), renseigner `ANDROID_APK_URL` dans
`/etc/hifidh/api.env` puis `sudo systemctl restart hifidh-api`.

## Enregistrements de nos récitateurs (0.25.0)

Les MP3 ne sont pas dans Git (`mp3/` est ignoré) : ils sont servis par nginx depuis
`/var/www/almoyassir-app/audio/<id>/001.mp3 … 114.mp3` (→ `https://quran.bestconsultingit.com/audio/…`).
`install.sh` installe l'emplacement `/audio/` dans le snippet nginx ; son `rsync --delete` ne touche que `app/`.

1. **Copier les dossiers sur la VM** (5,4 Go ; SSH est fermé) : clé USB / disque partagé de la VM, par exemple
   vers `/srv/hifidh-mp3/`. Pour ouvrir SSH sur le réseau local seulement (sans redirection du port 22 sur la box) :
   demander d'abord à Anis (`sudo apt install openssh-server`).
2. **ffmpeg** (conseillé, paquet système : demander à Anis) — `sudo apt install ffmpeg`. Il sert à réduire les
   fichiers (≈ 300 → 64 kbit/s, 5 fois moins à télécharger pour l'élève) et à extraire le son de la Fatiha de
   Kamel Smida (fournie en vidéo .mp4 ; sans ffmpeg elle est ignorée et ne joue pas dans l'app).
3. **Vérifier puis publier** :
   ```bash
   cd $SRC
   python3 tools/publish_reciter_audio.py --id kamel_smida --src "/srv/hifidh-mp3/Kamel Smida" --list
   sudo python3 tools/publish_reciter_audio.py --id kamel_smida --src "/srv/hifidh-mp3/Kamel Smida" --kbps 64
   sudo python3 tools/publish_reciter_audio.py --id nooreddine_almeslati_khatma         --src "/srv/hifidh-mp3/Noureddine Meessleti الختمة الكاملة للشيخ نور الدين المسلاتي" --kbps 64
   sudo chmod -R a+rX /var/www/almoyassir-app/audio
   curl -sI https://quran.bestconsultingit.com/audio/kamel_smida/036.mp3 | head -3   # 200, audio/mpeg
   ```
   Sans ffmpeg : retirer `--kbps 64` (copie telle quelle).
4. La liste des sourates de chaque récitateur est dans l'app (`tools/reciters_own.json`, recopié dans
   `mobile/assets/data/reciters.json`) : si des sourates sont ajoutées plus tard, mettre à jour ce fichier
   (la commande `--list` affiche la liste) et republier l'app.

Ces récitateurs n'ont pas de minutages ayah par ayah : l'app joue la sourate entière (barre de progression,
± 15 s), sans suivi de l'ayah récité ni répétition. Les minutages viendront d'un alignement (projet qalun-timing).
