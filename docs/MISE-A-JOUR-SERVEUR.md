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

Puis sur le serveur (remplace la version précédente ; pas de redémarrage nécessaire) :

```bash
sudo install -d -m 755 -o root -g hifidh /var/lib/hifidh/download   # déjà fait par install.sh
sudo install -m 644 /tmp/Almoyassir-0.17.0-arm64.apk /var/lib/hifidh/download/Almoyassir.apk
rm /tmp/Almoyassir-0.17.0-arm64.apk
curl -sI https://quran.bestconsultingit.com/api/download/android | head -n 5   # 200 + application/vnd.android.package-archive
```

À chaque nouvelle version : refaire ces deux commandes (le lien ne change pas).
Pour utiliser un autre lien à la place (Google Drive…), renseigner `ANDROID_APK_URL` dans
`/etc/hifidh/api.env` puis `sudo systemctl restart hifidh-api`.
