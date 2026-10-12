#!/usr/bin/env bash
# À lancer UNE seule fois (en root) : ajoute la version web /app/ au site nginx « hifidh » existant.
#   sudo bash deploy/enable-webapp.sh
# Sauvegarde le fichier du site, ajoute une ligne « include », teste (nginx -t) puis recharge (reload).
# En cas d'échec du test, la sauvegarde est restaurée et rien n'est rechargé. Aucun autre site n'est touché.
set -euo pipefail
SITE=${SITE:-/etc/nginx/sites-available/hifidh}
SNIPPET=/etc/nginx/snippets/almoyassir-app.conf
LINE="include $SNIPPET;"

[ -f "$SITE" ] || { echo "Site introuvable : $SITE (précisez SITE=/chemin/du/site)"; exit 1; }
[ -f "$SNIPPET" ] || { echo "Lancez d'abord deploy/install.sh (il installe $SNIPPET)."; exit 1; }
if grep -qF "$LINE" "$SITE"; then echo "Déjà activé dans $SITE."; exit 0; fi

# La ligne va dans le bloc qui sert l'API (bloc HTTPS après certbot) : juste avant « location /api/ ».
n=$(grep -c 'location /api/ {' "$SITE" || true)
[ "$n" = 1 ] || { echo "« location /api/ { » trouvé $n fois dans $SITE : ajoutez à la main la ligne"; echo "    $LINE"; echo "dans le bloc server { listen 443 … } puis : nginx -t && systemctl reload nginx"; exit 1; }

BAK="$SITE.bak.$(date +%F-%H%M%S)"
cp -p "$SITE" "$BAK"
sed -i "s|^\([[:space:]]*\)location /api/ {|\1$LINE\n\n\1location /api/ {|" "$SITE"
if nginx -t; then
  systemctl reload nginx
  echo "Version web activée : https://<domaine>/app/  (sauvegarde : $BAK)"
else
  cp -p "$BAK" "$SITE"
  echo "nginx -t a échoué : fichier d'origine restauré, rien n'a été rechargé."
  exit 1
fi
