#!/usr/bin/env bash
# Sauvegarde quotidienne de la base Hifidh (14 jours conservés).
# Installation : sudo install -m 750 backup.sh /usr/local/bin/hifidh-backup
#                echo '30 2 * * * root /usr/local/bin/hifidh-backup' | sudo tee /etc/cron.d/hifidh-backup
set -euo pipefail
DIR=/var/backups/hifidh
mkdir -p "$DIR" && chmod 700 "$DIR"
set -a; . /etc/hifidh/api.env; set +a
STAMP=$(date +%F_%H%M)
MYSQL_PWD="$DB_PASSWORD" mariadb-dump --single-transaction --routines --no-tablespaces \
  -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" | gzip > "$DIR/hifidh_$STAMP.sql.gz"
find "$DIR" -name 'hifidh_*.sql.gz' -mtime +14 -delete
