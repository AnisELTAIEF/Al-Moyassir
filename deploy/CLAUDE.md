# Déploiement d'Almoyassir — الميسّر (ex-Hifidh al-Qur'an) sur la VM — guide pour Claude Code

> L'application s'appelle désormais **Almoyassir (الميسّر)**. Les noms techniques ne changent pas
> (service `hifidh-api`, base et utilisateur `hifidh`, dossiers `/opt/hifidh`, `/etc/hifidh`).

Ce fichier est destiné à **Claude Code exécuté sur la VM Linux** qui héberge déjà le site
Best Consulting IT. Il décrit comment installer l'API (Node.js) et l'admin web en réutilisant
le **MariaDB déjà en place**, sans perturber le site existant.

## Règles à respecter (non négociables)

1. **Ne jamais modifier, supprimer ou redémarrer brutalement ce qui sert le site Best CIT.**
   On ajoute un site (vhost) séparé ; on ne réécrit pas les fichiers de configuration existants.
2. **Base de données** : créer une base `hifidh` et un utilisateur `hifidh` dédiés. Ne jamais
   faire `DROP`, ni toucher aux autres bases, ni changer le mot de passe root.
3. Avant toute modification d'un fichier système : `cp fichier fichier.bak.$(date +%F)`.
4. Toujours tester la configuration avant de recharger : `nginx -t` ou `apachectl -t`.
   Recharger (`reload`), jamais `restart` du serveur web.
5. **Demander à Anis avant** : le choix du domaine, l'ouverture d'un port, l'exécution de
   certbot, l'installation d'un paquet système majeur (Node.js).
6. Ne jamais afficher ni committer les secrets (`/etc/hifidh/api.env`, `key.properties`).

## Architecture cible

```
Internet ──HTTPS──> Nginx ou Apache (existant)
                     ├─ DOMAINE/            → /var/www/hifidh-admin   (admin web, fichiers statiques)
                     ├─ DOMAINE/api/…       → http://127.0.0.1:8787/… (API Node, service systemd)
                     └─ DOMAINE/invite/…    → http://127.0.0.1:8787/invite/… (page d'invitation)
API Node (utilisateur système « hifidh », écoute sur 127.0.0.1 uniquement)
 └─ MariaDB existant : base « hifidh », utilisateur « hifidh »
```

`DOMAINE` = sous-domaine conseillé, par ex. `quran.bestconsultingit.com` (à confirmer avec Anis ;
un enregistrement DNS A/AAAA vers l'IP de la VM est nécessaire).

## Étape 0 — État des lieux (lecture seule)

```bash
uname -a; cat /etc/os-release | head -3
systemctl is-active nginx apache2 httpd 2>/dev/null   # quel serveur web tourne ?
ss -ltnp | grep -E ':80 |:443 |:3306 |:8787 '          # ports occupés (8787 doit être libre)
mariadb --version; systemctl is-active mariadb mysql
node -v 2>/dev/null || echo "Node.js absent"
which rsync git certbot
ls /etc/nginx/sites-enabled 2>/dev/null; ls /etc/apache2/sites-enabled 2>/dev/null
```

Résumer à Anis ce qui a été trouvé (serveur web, version MariaDB, Node) avant de continuer.
L'API est testée avec MariaDB 10.11 ; elle utilise des fonctions disponibles depuis MariaDB 10.5.
Si le port 8787 est pris, choisir un autre port et l'utiliser partout (PORT + proxy).

## Étape 1 — Node.js 20 ou plus

Si `node -v` < 20 ou absent : **demander l'accord**, puis installer depuis la distribution ou
NodeSource (vérifier la méthode recommandée actuelle sur nodejs.org). Installer aussi `rsync` si absent.

## Étape 2 — Récupérer le projet

Copier le dossier du projet sur la VM (git clone si un dépôt existe, sinon scp/rsync depuis
le PC d'Anis), par ex. dans `/opt/hifidh-src`. Vérifier : `ls /opt/hifidh-src/{server,admin,deploy}`.

## Étape 3 — Base de données

```bash
PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
sed "s/MOT_DE_PASSE/$PASS/" /opt/hifidh-src/deploy/create-db.sql | sudo mariadb
# Vérification (doit lister uniquement la base hifidh pour cet utilisateur) :
MYSQL_PWD="$PASS" mariadb -u hifidh -e "SHOW DATABASES;"
```
Si `sudo mariadb` demande un mot de passe, demander à Anis comment il se connecte en root
(certaines installations utilisent `mysql -u root -p`).

## Étape 4 — Configuration de l'API

```bash
sudo mkdir -p /etc/hifidh
sudo cp /opt/hifidh-src/deploy/api.env.example /etc/hifidh/api.env
sudo chmod 600 /etc/hifidh/api.env
```
Renseigner dans `/etc/hifidh/api.env` :
- `DB_PASSWORD` = le `$PASS` de l'étape 3 ;
- `JWT_SECRET` = `openssl rand -base64 48` ;
- `PUBLIC_URL` et `CORS_ORIGINS` = `https://DOMAINE` ;
- `GOOGLE_CLIENT_IDS` = identifiants fournis par Anis (voir « Connexion Google » plus bas ;
  peut rester vide au début : seule la connexion par e-mail fonctionnera).
- `BOOTSTRAP_ADMIN_EMAIL=anis.eltaief@gmail.com` (déjà rempli).

## Étape 5 — Installation

```bash
cd /opt/hifidh-src
sudo ADMIN_API_URL=https://DOMAINE/api ADMIN_GOOGLE_CLIENT_ID=<id client Web ou vide> bash deploy/install.sh
```
Le script : crée l'utilisateur système `hifidh`, copie l'API dans `/opt/hifidh/server`,
installe les dépendances, applique les migrations SQL (idempotent), installe et démarre le
service `hifidh-api`, construit l'admin web et le publie dans `/var/www/hifidh-admin`.

Vérifier :
```bash
systemctl status hifidh-api --no-pager
curl -s http://127.0.0.1:8787/health          # {"ok":true}
journalctl -u hifidh-api -n 50 --no-pager      # en cas de problème
```

## Étape 6 — Serveur web (selon l'étape 0)

**Nginx** :
```bash
sudo cp /opt/hifidh-src/deploy/nginx-hifidh.conf /etc/nginx/sites-available/hifidh
sudo sed -i 's/DOMAINE/quran.bestconsultingit.com/' /etc/nginx/sites-available/hifidh   # domaine validé par Anis
sudo ln -s /etc/nginx/sites-available/hifidh /etc/nginx/sites-enabled/hifidh
sudo nginx -t && sudo systemctl reload nginx
```
(Sur une distribution sans `sites-available`, placer le fichier dans `/etc/nginx/conf.d/hifidh.conf`.)

**Apache** :
```bash
sudo a2enmod proxy proxy_http headers rewrite
sudo cp /opt/hifidh-src/deploy/apache-hifidh.conf /etc/apache2/sites-available/hifidh.conf
sudo sed -i 's/DOMAINE/quran.bestconsultingit.com/' /etc/apache2/sites-available/hifidh.conf
sudo a2ensite hifidh && sudo apachectl -t && sudo systemctl reload apache2
```

Contrôles (avant HTTPS) :
```bash
curl -s -H "Host: DOMAINE" http://127.0.0.1/api/health      # {"ok":true}
curl -s -H "Host: DOMAINE" http://127.0.0.1/invite/ABCD-EFGH | grep ABCD-EFGH
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: DOMAINE" http://127.0.0.1/   # 200
# Et vérifier que le site Best CIT répond toujours comme avant.
```

## Étape 7 — HTTPS (avec l'accord d'Anis, une fois le DNS en place)

```bash
sudo certbot --nginx -d DOMAINE     # ou --apache
```
Puis : `curl -s https://DOMAINE/api/health`.

## Étape 8 — Sauvegardes

```bash
sudo install -m 750 /opt/hifidh-src/deploy/backup.sh /usr/local/bin/hifidh-backup
echo '30 2 * * * root /usr/local/bin/hifidh-backup' | sudo tee /etc/cron.d/hifidh-backup
sudo /usr/local/bin/hifidh-backup && ls -lh /var/backups/hifidh
```
Restauration : `gunzip -c fichier.sql.gz | mariadb -u hifidh -p hifidh`.

## Étape 9 — Premier accès

Anis ouvre `https://DOMAINE`, se connecte avec Google (`anis.eltaief@gmail.com`) : le compte
est créé **administrateur** automatiquement. Sans Google configuré, il peut créer un mot de passe
avec ce même e-mail depuis l'app mobile (« Créer un compte » → « Je suis l'administrateur principal
(sans code) ») ou via :
```bash
curl -s -X POST https://DOMAINE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"anis.eltaief@gmail.com","password":"<mot de passe choisi par Anis>","displayName":"Anis"}'
```

## Étape 10 — Ensuite

Une fois le serveur en service, ouvrir `docs/A-FAIRE-APRES-SERVEUR.md` : améliorations de l'app
validées par Anis, à traiter dans l'ordre (proposer un plan court avant de coder).

## Mise à jour ultérieure

Récupérer la nouvelle version dans `/opt/hifidh-src`, puis relancer l'étape 5 (le script est
idempotent ; les migrations déjà appliquées sont ignorées).

## Connexion Google (à faire par Anis dans Google Cloud Console)

Les noms de menus de la console peuvent changer : vérifier dans la documentation Google actuelle.
1. Écran de consentement OAuth : type « Externe », nom « Almoyassir », e-mail d'assistance.
2. Identifiants → « ID client OAuth » :
   - **Application Web** : origine JavaScript autorisée `https://DOMAINE`. Cet ID sert à l'admin
     web (`ADMIN_GOOGLE_CLIENT_ID`) **et** de `GOOGLE_SERVER_CLIENT_ID` pour l'app mobile.
   - **Android** : nom de package `com.bestconsultingit.hifidh_quran` + empreinte SHA-1 du
     certificat de signature (`keytool -list -v -keystore <fichier .jks>` ; pour Google Play,
     ajouter aussi la SHA-1 de « signature d'application » affichée dans la Play Console).
   - **iOS** : ID de bundle `com.bestconsultingit.hifidhQuran`. Reporter son « iOS URL scheme »
     dans `mobile/ios/Runner/Info.plist` (remplacer `REMPLACER-PAR-ID-CLIENT-IOS`).
3. Mettre **les trois ID** dans `GOOGLE_CLIENT_IDS` (séparés par des virgules), puis
   `sudo systemctl restart hifidh-api`.

## Dépannage rapide

| Symptôme | Vérification |
|---|---|
| 502 sur /api | `systemctl status hifidh-api`, `curl 127.0.0.1:8787/health` |
| « Table surahs incomplète » | migrations non appliquées : `sudo bash -c 'set -a; . /etc/hifidh/api.env; set +a; cd /opt/hifidh/server && node src/migrate.js'` |
| Erreur CORS dans l'admin | `CORS_ORIGINS` doit être exactement `https://DOMAINE` |
| Google : « Connexion Google refusée » | l'ID client utilisé n'est pas dans `GOOGLE_CLIENT_IDS` |
| « invitation_required » | la personne n'a pas d'invitation : la créer dans l'admin |
