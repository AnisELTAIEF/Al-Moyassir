#!/usr/bin/env bash
# Met à jour l'enregistrement DuckDNS avec l'IP publique actuelle de la VM.
# Le domaine et le jeton sont dans /etc/duckdns/duckdns.env (hors Git, lecture root seule).
# Installé dans /usr/local/bin/duckdns-update.sh — voir docs/IP-DYNAMIQUE-DUCKDNS.md.
set -euo pipefail
. /etc/duckdns/duckdns.env   # DUCKDNS_DOMAINS, DUCKDNS_TOKEN
# ip= vide -> DuckDNS détecte automatiquement l'IP source (= IP publique de la VM).
resp=$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAINS}&token=${DUCKDNS_TOKEN}&ip=&verbose=true" || echo "KO")
printf '%s %s\n' "$(date -Is)" "${resp//$'\n'/ }" >> /var/log/duckdns.log
[[ "$resp" == OK* ]]
