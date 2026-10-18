# IP publique dynamique — solution DuckDNS + CNAME

La VM de déploiement a une **IP publique dynamique** (elle change plusieurs fois par jour). Avant,
le DNS pointait sur une IP figée (enregistrement A) : à chaque changement, `quran.bestconsultingit.com`
(app Quran, API, admin) et `www.bestconsultingit.com` devenaient inaccessibles jusqu'à une correction
manuelle du DNS.

**Solution en place (14/10/2026) :** un petit service sur la VM maintient un nom DuckDNS pointé sur
l'IP réelle, et le DNS du domaine utilise des **CNAME** vers ce nom. Plus aucune édition manuelle.

```
quran.bestconsultingit.com ─CNAME─┐
www.bestconsultingit.com   ─CNAME─┤
                                  └─> almoyassir.duckdns.org ─A─> (IP publique actuelle de la VM)
                                        ▲ mis à jour toutes les 2 min par duckdns.timer (systemd)
```

- Le domaine est **enregistré chez OVH** ; depuis le 14/10/2026 ses serveurs DNS pointent vers **Cloudflare**
  (zone gratuite). La messagerie reste chez **Microsoft 365** : ses enregistrements (MX, SPF, DKIM,
  autodiscover, Teams, Intune) sont dupliqués dans Cloudflare, tous en « DNS only » (nuage gris).
- Bascule automatique après un changement d'IP : ~2–3 min (intervalle de mise à jour + TTL DuckDNS 60 s).
- L'apex `bestconsultingit.com` est un CNAME `@` → `almoyassir.duckdns.org` chez Cloudflare (CNAME flattening),
  « DNS only », avec son propre certificat ; nginx le redirige vers `https://www.bestconsultingit.com`
  (`deploy/nginx-bestcit-apex.conf`).
- **Pré-requis permanent** : la box/routeur doit rediriger les ports TCP **80 et 443** vers la VM.

## Mise en place (déjà faite — pour mémoire / réinstallation)

### 1. Compte DuckDNS
Sur https://www.duckdns.org : se connecter, créer un sous-domaine (ici `almoyassir`), copier le **token**.

### 2. Service de mise à jour sur la VM
```bash
SRC=/home/anis/repo/Al-Moyassir/Al-Moyassir
sudo install -m 755 $SRC/deploy/duckdns/duckdns-update.sh /usr/local/bin/duckdns-update.sh
sudo mkdir -p /etc/duckdns
sudo cp $SRC/deploy/duckdns/duckdns.env.example /etc/duckdns/duckdns.env
sudo chmod 600 /etc/duckdns/duckdns.env
sudo nano /etc/duckdns/duckdns.env     # mettre DUCKDNS_DOMAINS et le vrai DUCKDNS_TOKEN
sudo cp $SRC/deploy/duckdns/duckdns.service /etc/systemd/system/
sudo cp $SRC/deploy/duckdns/duckdns.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo /usr/local/bin/duckdns-update.sh                 # 1er essai : doit finir par « OK ... UPDATED »
sudo systemctl enable --now duckdns.timer
dig +short almoyassir.duckdns.org @1.1.1.1            # doit = IP publique de la VM
```

### 3. DNS du domaine (Cloudflare ; NS changés chez OVH → Manager OVH → Serveurs DNS)
Enregistrements du site, tous en **DNS only** (gris) :

| Nom | Type | Valeur |
|---|---|---|
| `@` | CNAME | `almoyassir.duckdns.org` |
| `quran` | CNAME | `almoyassir.duckdns.org` |
| `www` | CNAME | `almoyassir.duckdns.org` |

La messagerie Microsoft 365 (MX, SPF, 2 DKIM, autodiscover, sip, lyncdiscover, SRV Teams, Intune,
TXT `MS=`) doit rester présente et en « DNS only » dans la même zone. Pas de DMARC pour l'instant :
à ajouter (`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:…`).

### 4. Reverse-proxy www → site Best CIT (Docker :8081) + HTTPS
```bash
sudo cp $SRC/deploy/nginx-bestcit-www.conf /etc/nginx/sites-available/bestcit-www
sudo ln -sfn /etc/nginx/sites-available/bestcit-www /etc/nginx/sites-enabled/bestcit-www
sudo nginx -t && sudo systemctl reload nginx
# une fois que www résout vers la VM :
sudo certbot --nginx -d www.bestconsultingit.com --redirect
# apex (sans www) : redirection vers www + certificat
sudo cp $SRC/deploy/nginx-bestcit-apex.conf /etc/nginx/sites-available/bestcit-apex
sudo ln -sfn /etc/nginx/sites-available/bestcit-apex /etc/nginx/sites-enabled/bestcit-apex
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bestconsultingit.com --redirect
```

> Note : le service API (`ProtectSystem=strict`) n'écrit que dans `/var/lib/hifidh/certificates` (`ReadWritePaths`).

## Vérification / diagnostic

```bash
# L'updater tourne-t-il ?
systemctl status duckdns.timer
tail -n 3 /var/log/duckdns.log                 # doit finir par « OK <ip> UPDATED » ou « OK <ip> NOCHANGE »

# Le DNS suit-il l'IP réelle ?
curl -s https://api.ipify.org; echo            # IP réelle de la VM
dig +short quran.bestconsultingit.com @1.1.1.1 # doit donner la même IP

# Les services répondent-ils (test externe simulé, contourne le NAT hairpin) ?
curl -s -o /dev/null -w "%{http_code}\n" --resolve quran.bestconsultingit.com:443:127.0.0.1 https://quran.bestconsultingit.com/app/
curl -s -o /dev/null -w "%{http_code}\n" --resolve www.bestconsultingit.com:443:127.0.0.1   https://www.bestconsultingit.com/en/
```

Si le DNS est bon mais le site reste injoignable de l'extérieur : vérifier la **redirection de ports
80/443** sur la box (elle saute parfois après un redémarrage du routeur).
