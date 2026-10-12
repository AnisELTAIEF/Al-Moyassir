#!/usr/bin/env bash
# Compile la version web de l'app (iPhone, iPad, navigateur) dans webapp/ (versionné : le serveur
# n'a pas besoin de Flutter, un `git pull` + deploy/install.sh suffit).
# Usage (depuis la racine du dépôt) : bash tools/build-webapp.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT/mobile"
flutter build web --release --base-href /app/ --no-web-resources-cdn
rm -rf "$ROOT/webapp"
cp -r build/web "$ROOT/webapp"
cd "$ROOT/webapp"
# Inutile en production : symboles de débogage et variantes WebAssembly (build JS uniquement).
find canvaskit -name '*.symbols' -delete
rm -f canvaskit/skwasm* canvaskit/wimp*
cat > LISEZ-MOI.txt <<'TXT'
Fichiers GÉNÉRÉS par tools/build-webapp.sh — ne pas modifier à la main.
Version web de l'app Almoyassir, publiée sur https://<domaine>/app/ par deploy/install.sh.
TXT
du -sh "$ROOT/webapp"
