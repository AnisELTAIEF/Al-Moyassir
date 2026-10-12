# Mettre à jour le serveur (API + admin web)

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
- reconstruit l'**admin web** et le publie dans `/var/www/hifidh-admin`.

Si la connexion Google est configurée pour l'admin web, ajouter `ADMIN_GOOGLE_CLIENT_ID=<id client Web>`
à la commande.

## 4. Vérifier

```bash
systemctl status hifidh-api --no-pager | head -5
curl -s https://quran.bestconsultingit.com/api/health          # {"ok":true}
journalctl -u hifidh-api -n 30 --no-pager                       # en cas d'erreur
```

Puis ouvrir `https://quran.bestconsultingit.com` (admin web) et recharger la page (Ctrl+F5).

## En cas de problème

| Symptôme | Que faire |
|---|---|
| `git status` montre des fichiers modifiés | Modifications faites sur le serveur : `git diff` pour les voir ; les pousser depuis le serveur ou les annuler (`git restore <fichier>`) avant `git pull`. |
| `git pull` signale un conflit | Ne rien forcer : demander à Claude Code sur le serveur de le résoudre. |
| « Migration » en erreur | Rien n'est perdu : lire le message, restaurer si besoin la sauvegarde de l'étape 2 (`gunzip -c fichier.sql.gz \| mariadb -u hifidh -p hifidh`). |
| API qui ne redémarre pas | `journalctl -u hifidh-api -n 50 --no-pager` ; vérifier `/etc/hifidh/api.env`. |
| Admin web inchangé | Vider le cache du navigateur (Ctrl+F5). |

## Historique des mises à jour nécessitant le serveur

| Version app | Ce que la mise à jour serveur apporte |
|---|---|
| 0.7.0 | Migration 004 : marquage « à revoir » synchronisé |
| 0.9.0 | Nouveau nom « Almoyassir (الميسّر) » dans les invitations et l'admin web |
| 0.10.0 | Migration 005 : **code de groupe** (6 caractères), inscription avec un seul code, « Rejoindre un groupe » |
