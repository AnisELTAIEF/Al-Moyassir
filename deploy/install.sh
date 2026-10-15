#!/usr/bin/env bash
# Installe ou met à jour l'API et l'admin web à partir de ce dépôt.
# Usage (depuis la racine du projet, en root) : sudo bash deploy/install.sh
# Prérequis : /etc/hifidh/api.env rempli, base créée (voir CLAUDE.md), Node.js >= 20.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)

node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
  || { echo "Node.js 20 ou plus est requis (node -v)."; exit 1; }
[ -f /etc/hifidh/api.env ] || { echo "Créez d'abord /etc/hifidh/api.env (voir deploy/api.env.example)."; exit 1; }
chmod 600 /etc/hifidh/api.env

id hifidh >/dev/null 2>&1 || useradd --system --home /opt/hifidh --shell /usr/sbin/nologin hifidh
# Dossier de l'APK Android téléchargeable (/api/download/android) — voir docs/MISE-A-JOUR-SERVEUR.md
install -d -m 755 -o root -g hifidh /var/lib/hifidh/download

# API
mkdir -p /opt/hifidh/server
rsync -a --delete --exclude node_modules --exclude test "$ROOT/server/" /opt/hifidh/server/
(cd /opt/hifidh/server && npm ci --omit=dev --no-audit --no-fund)
chown -R root:hifidh /opt/hifidh && chmod -R o-rwx /opt/hifidh
set -a; . /etc/hifidh/api.env; set +a
(cd /opt/hifidh/server && node src/migrate.js)

install -m 644 "$ROOT/deploy/hifidh-api.service" /etc/systemd/system/hifidh-api.service
systemctl daemon-reload
systemctl enable hifidh-api >/dev/null
systemctl restart hifidh-api
sleep 2
curl -fsS "http://127.0.0.1:${PORT:-8787}/health" && echo " ← API OK"

# Admin web (si VITE_API_URL est fourni)
if [ -n "${ADMIN_API_URL:-}" ]; then
  (cd "$ROOT/admin" && npm ci --no-audit --no-fund && VITE_API_URL="$ADMIN_API_URL" VITE_GOOGLE_CLIENT_ID="${ADMIN_GOOGLE_CLIENT_ID:-}" npm run build)
  mkdir -p /var/www/hifidh-admin
  rsync -a --delete "$ROOT/admin/dist/" /var/www/hifidh-admin/
  echo "Admin web publié dans /var/www/hifidh-admin"
else
  echo "Admin web non construit : relancez avec ADMIN_API_URL=https://DOMAINE/api"
fi

# Version web de l'app (iPhone, iPad, navigateur), précompilée dans webapp/ (tools/build-webapp.sh)
if [ -f "$ROOT/webapp/index.html" ]; then
  mkdir -p /var/www/almoyassir-app/app
  rsync -a --delete "$ROOT/webapp/" /var/www/almoyassir-app/app/
  chmod -R a+rX /var/www/almoyassir-app
  echo "Version web publiée dans /var/www/almoyassir-app/app"
  if [ -d /etc/nginx ]; then
    mkdir -p /etc/nginx/snippets
    SNIP=/etc/nginx/snippets/almoyassir-app.conf
    if ! cmp -s "$ROOT/deploy/nginx-almoyassir-app.conf" "$SNIP"; then
      [ -f "$SNIP" ] && cp -p "$SNIP" "$SNIP.bak.$(date +%F-%H%M%S)"
      install -m 644 "$ROOT/deploy/nginx-almoyassir-app.conf" "$SNIP"
      if grep -RqsF "include $SNIP;" /etc/nginx/sites-enabled /etc/nginx/conf.d; then
        if nginx -t; then systemctl reload nginx && echo "nginx rechargé (configuration /app/ mise à jour)"
        else echo "ATTENTION : nginx -t échoue avec le nouveau $SNIP — rien n'a été rechargé ; voir la sauvegarde $SNIP.bak.*"; fi
      fi
    fi
    grep -RqsF "include $SNIP;" /etc/nginx/sites-enabled /etc/nginx/conf.d \
      || echo "Version web pas encore activée dans nginx : lancez une fois  sudo bash deploy/enable-webapp.sh"
  fi
fi
