# Plan d'exécution — évolutions de la réunion 1

Prépare l'exécution des 23 demandes (voir `docs/EVOLUTIONS-REUNION-1.md`, décisions D1-D20 dans son §0).
Version du dépôt et de la production au 17/10/2026 : **0.17.0+19**.

## 0. Règles de conduite (valables pour tous les lots)

- **Migrations SQL additives uniquement** (`server/sql/009_…`, numérotées à la suite ; colonnes nullables, aucune suppression) :
  les comptes, groupes et progressions existants doivent continuer à fonctionner.
- **Un lot = un déploiement.** Fin de lot : `flutter analyze` · `flutter test` (dont `i18n_test.dart`) · `npm test` (admin) ·
  `npm test` (serveur, base de test MariaDB) · commit · push · `sudo ADMIN_API_URL=https://quran.bestconsultingit.com/api bash deploy/install.sh`
  · `sudo chown -R anis:anis` du dépôt · vérification en ligne (`/app/`, `/api/health`, BO) · mise à jour de la version (`mobile/pubspec.yaml`).
- **Web et mobile en même temps** : tout se code dans `mobile/lib/`. Après chaque lot touchant l'app : `bash tools/build-webapp.sh`
  (Flutter est installé sur la VM, ~3 min) puis déploiement.
- Toute nouvelle chaîne `tr('…')` reçoit son arabe dans `mobile/lib/core/i18n_ar.dart` (le test i18n l'exige).
- Accessibilité des couleurs : étendre `mobile/test/ayah_coloring_test.dart` pour toute nouvelle teinte (palette daltonien comprise).
- Ne jamais toucher au site Best CIT (Docker :8081), ni aux secrets (`/etc/hifidh/api.env`, `/etc/duckdns/duckdns.env`).
- Toutes les décisions D1-D20 sont prises ; si un cas imprévu apparaît, **le signaler et proposer un défaut**, sans improviser silencieusement.
- **Vie privée** : l'API de l'équipe ne renvoie jamais les marques personnelles d'un élève (D15) ; tests dédiés.

---

## Lot A — Gains rapides (aucun changement de base de données)

| Tâche | Détail | Fichiers | Critère d'acceptation |
|---|---|---|---|
| **A1** Langue par défaut = arabe (21) | `Settings` : valeur par défaut `'ar'` quand `language` n'a jamais été enregistré (les choix existants sont respectés) | `mobile/lib/core/settings.dart` | Nouvel appareil/navigateur : interface en arabe ; un utilisateur ayant choisi « fr » reste en français |
| **A2** Vue « Pages » par défaut (8, D11) | 3ᵉ onglet **« صفحات / Pages »** en **première** position dans Lire (grille/liste des 604 pages avec avancement) ; ouvre le lecteur Qira'a à la page | `mobile/lib/screens/surah_list_screen.dart`, nouvelle `pages_list_view.dart`, `quran_repository.dart` (`mushafPages`) | Onglet par défaut = Pages ; l'avancement d'une page = ayat acquis / ayat de la page |
| **A3** Marquer une page entière (D11) | Action « Page apprise / Annuler » dans la liste des pages et dans le lecteur Qira'a (équivalent du « sourate apprise » existant) | `progress_store.dart`, `reader_screen.dart`, `mushaf_reader.dart` | Marquer la page 50 marque tous ses ayat ; annulation possible ; synchronisé comme les autres marquages |
| **A4** Estimateur de khatma (23) | Nouvel écran (accessible depuis l'accueil et le compte) : jours/semaine, durée/séance, rythme (lent/moyen/soutenu ou ayat par séance), part de révision, ayat déjà acquis → **durée estimée** et **date probable** ; calcul local | `mobile/lib/screens/khatma_planner_screen.dart`, `home_screen.dart` | Résultats cohérents (tests unitaires sur la formule) ; textes en arabe et français |
| **A5** Récitateur « sourate entière » | Champ `timings: false` dans `reciters.json` : le lecteur joue la sourate sans suivi ayah par ayah (affichage clair « suivi indisponible ») | `audio_controller.dart`, `quran_repository.dart`, `reciters.json` | Un récitateur sans minutages joue sans erreur « Minutages indisponibles » |
| **A6** Hébergement audio | Dossier `/var/lib/hifidh/audio/<id>/NNN.mp3` + `location /audio/` nginx (Range) ; entrées `reciters.json` pour كمال صميدة et المسلاتي (53 → 114) **dès que les MP3 sont fournis** | `deploy/install.sh`, `deploy/nginx-hifidh.conf`, `reciters.json` | `curl -I https://quran…/audio/<id>/001.mp3` → 200 + `Accept-Ranges` ; lecture dans l'app |
| **A7** Nom de l'app (18, D16) | Appliquer **« حفظ قالون » / Hifdh Qalun** (repli : « تحفيظ قالون » / Tahfidh Qalun) : libellés, `manifest.json`, `title`, invitations, e-mails. **D'abord vérifier la disponibilité** dans Google Play et l'App Store (recherche manuelle par Anis) | `app.dart`, `web/manifest.json`, `i18n_ar.dart`, `server/src/routes/invite.js` | Aucun identifiant technique ne change |

**Livrable A** : version **0.18.0**. Déploiement (app web + API inchangée).

---

## Lot B — Fondations de données (établissements, classes, rôles, fiche élève)

### B1. Données de référence côté serveur (prérequis de tous les calculs)
Le serveur ne connaît aujourd'hui que le nombre d'ayat par sourate. Il lui faut :
- `mushaf_pages(page SMALLINT PRIMARY KEY, surah TINYINT UNSIGNED, ayah SMALLINT UNSIGNED)` — 604 débuts de page, générés depuis
  `mobile/assets/data/mushaf_pages.json` ;
- `hizb_starts(hizb TINYINT UNSIGNED PRIMARY KEY, surah …, ayah …)` — 60 débuts de hizb = un thumun sur 8 de
  `mobile/assets/data/divisions.json` (480 thumun) ;
- script `tools/build_server_data.py` qui produit `server/sql/009_reference_data.sql` depuis ces JSON, + **test serveur** qui
  vérifie l'égalité avec les JSON de l'app (anti-dérive).

### B2. Schéma (migration `010_organizations.sql`, brouillon à relire)
```sql
CREATE TABLE IF NOT EXISTS organizations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  type ENUM('association','mosque') NOT NULL,
  address VARCHAR(255) NOT NULL DEFAULT '',          -- مقر الإدارة
  error_threshold TINYINT UNSIGNED NOT NULL DEFAULT 3, -- seuil « page à reprendre » (D4)
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_org_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS org_members (               -- rôles par établissement (D5)
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('admin','teacher','student') NOT NULL,     -- إداري / مدرس / طالب
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, user_id, role),
  KEY idx_org_members_user (user_id),
  CONSTRAINT fk_om_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_om_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE study_groups ADD COLUMN organization_id CHAR(36) NULL AFTER name;   -- classe/halqa/fawj d'un établissement
ALTER TABLE group_members MODIFY role ENUM('admin','member','teacher') NOT NULL DEFAULT 'member';

CREATE TABLE IF NOT EXISTS student_profiles (          -- fiche administrative (point 5)
  id CHAR(36) NOT NULL PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,                               -- compte rattaché (code de liaison), facultatif
  full_name VARCHAR(120) NOT NULL,                     -- الاسم واللقب
  father_name VARCHAR(80) NOT NULL DEFAULT '',         -- اسم الأب
  birth_date DATE NULL,                                -- on stocke la date, l'âge est calculé
  gender ENUM('m','f') NULL,
  phone VARCHAR(20) NULL,                              -- format international
  phone_verified_at DATETIME(3) NULL,
  joined_at DATE NULL,                                 -- تاريخ الانخراط
  hifdh_started_at DATE NULL,                          -- تاريخ بداية الحفظ
  status ENUM('active','left') NOT NULL DEFAULT 'active',   -- élève sorti : archivé, jamais supprimé (D20)
  left_at DATE NULL,
  retain_until DATE NULL,                              -- left_at + 5 ans : purge manuelle possible après cette date
  past_competitions TEXT NULL,                         -- مشاركات سابقة
  guardian_consent_at DATETIME(3) NULL,                -- consentement des parents recueilli à l'inscription (D13)
  link_code_hash CHAR(64) NULL,                        -- code de liaison au compte (D17)
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_sp_org_name (organization_id, full_name, father_name),   -- détection de doublons
  KEY idx_sp_user (user_id),
  CONSTRAINT fk_sp_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_students (            -- élève ↔ classe (plusieurs classes possibles)
  group_id CHAR(36) NOT NULL,
  profile_id CHAR(36) NOT NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (group_id, profile_id),
  CONSTRAINT fk_gs_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_gs_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS phone_verifications (       -- D3, phase 1
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,                     -- 15 minutes
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,        -- 5 essais maximum
  CONSTRAINT fk_pv_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
*Le profil existe sans compte* : l'administratif crée l'élève (case **« autorisation des parents obtenue »** obligatoire, D13) ; le parent crée un compte pour son enfant (e-mail à lui, D17) et le rattache avec un **code de liaison**
(même mécanique que les codes d'invitation : empreinte SHA-256, usage unique, expiration).

### B3. API (nouveau `server/src/routes/orgs.js`, préfixe `/orgs`)
| Route | Qui | Rôle |
|---|---|---|
| `GET /orgs` | connecté | mes établissements + mes rôles |
| `POST /orgs`, `PATCH /orgs/:id` | admin global (création) / admin de l'établissement | nom, type, adresse, seuil d'erreurs |
| `GET/PUT/DELETE /orgs/:id/members` | admin de l'établissement | gérer إداري / مدرس |
| `GET/POST /orgs/:id/classes`, `PATCH/DELETE …/:gid`, `PUT …/:gid/teachers` | admin | classes (réutilise `study_groups`) |
| `GET/POST /orgs/:id/students`, `GET/PATCH/DELETE …/:pid` | admin ; enseignant en lecture sur ses classes | fiche élève, **alerte de doublon** (même nom + père) |
| `POST …/:pid/phone-code`, `POST …/:pid/phone-verify` | admin/enseignant | code WhatsApp (phase 1) |
| `POST …/:pid/link-code`, `POST /me/link-student` | admin ; élève/parent | rattacher un compte à un profil |
| `GET …/:pid/summary` | équipe | حفظ إجمالي / مسترسل (voir lot C pour la source « validée ») |

Garde-fous : un enseignant ne voit que **ses** classes ; un compte hors établissement ne voit rien ; toute route vérifie le rôle **dans l'établissement
de la route** (jamais le rôle global seul). Tests : isolation entre deux établissements, multi-rôles, doublons, expiration du code.

### B4. Calculs (nouveau `server/src/reports.js`, purs et testés)
- `completeSurahs(set)` / `completeAhzab(set)` : sourates / ahzab dont **tous** les ayat sont acquis.
- `longestRun(units)` : plus longue suite consécutive dans l'ordre du mushaf (D1).
- **Propriété testée** : successif ≤ global, dans chaque unité ; cas limites (sourate courte, hizb à cheval sur deux sourates, ensemble vide).

### B5. BO (arabe/français — voir lot D pour l'i18n)
Pages **« Établissements »** (liste, création, adresse, type, seuil), **« Classes »** et **« Élèves »** (fiche, **consentement parental obligatoire**, doublons, code de liaison, vérification du téléphone avec lien
`wa.me` pré-rempli), sélecteur d'établissement dans l'en-tête.

### B6. App
Écran **« Mes établissements »** (compte) avec rattachement par code de liaison ; sélecteur d'établissement si plusieurs.

### B7. Conservation et sauvegardes (D20)
- Un élève qui quitte l'association passe en `status='left'` (`left_at`, `retain_until = left_at + 5 ans`) : il disparaît des listes courantes et des
  classements mais **ses données sont conservées** ; pas de suppression automatique ; purge manuelle par un administrateur global, uniquement après `retain_until`.
- **Sauvegardes longue durée** : en plus du dump quotidien (14 jours), ajouter à `deploy/backup.sh` un **dump mensuel conservé ≥ 5 ans**
  (`/var/backups/hifidh/monthly/`), et une **copie chiffrée sur F: de l'hôte Windows (D21)** (liaison VM ↔ F: : **disque virtuel dédié « Backup U » (VHDX 50 Go) sur F:**, voir la procédure ci-dessous ; **chiffrement avant écriture** car les sauvegardes contiennent des données d'enfants ; clé de chiffrement conservée **hors** de la VM et de F: ; aucun secret dans le dépôt) ;
  documenter la **procédure de restauration** et la tester une fois dans `docs/MISE-A-JOUR-SERVEUR.md`.

#### Mise en service du disque « Backup U » (à faire avec Anis, une seule fois)
**Côté Windows (Anis)** — Gestionnaire Hyper-V → clic droit sur la VM → *Paramètres* → *Contrôleur SCSI* → *Disque dur* → *Ajouter* → *Nouveau* →
type **VHDX**, **extensible dynamiquement**, nom `Backup U.vhdx`, emplacement **`F:\`** (dossier au choix), taille **50 Go** → *Appliquer*.
L'ajout à chaud fonctionne sur une VM de génération 2 ; sinon arrêter la VM le temps de l'ajout.

**Côté Linux (moi)** — avec vérifications avant toute écriture (le formatage est destructif : on ne formate **que** le disque neuf et vide) :
```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS      # repérer le nouveau disque : ~50G, sans FSTYPE, sans MOUNTPOINTS (ex. sdb)
# Après contrôle explicite du nom du disque :
sudo parted /dev/sdb --script mklabel gpt mkpart backup ext4 1MiB 100%
sudo mkfs.ext4 -L BACKUPU /dev/sdb1
sudo mkdir -p /srv/backup-u
echo 'LABEL=BACKUPU /srv/backup-u ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab   # (cp /etc/fstab /etc/fstab.bak.$(date +%F) avant)
sudo mount -a && df -h /srv/backup-u
sudo chmod 700 /srv/backup-u
```
`nofail` : si le disque est absent au démarrage, la VM et les sites démarrent quand même. Le script de sauvegarde **refuse d'écrire** si
`/srv/backup-u` n'est pas réellement monté (sinon la copie atterrirait sur le disque de la VM sans le dire).

**Ce que contient la copie** : dump mensuel de la base (conservé ≥ 5 ans), dump quotidien récent, certificats (lot E) ; les MP3 des récitateurs
n'y sont pas obligatoires (les originaux restent chez Anis). **Chiffrement** avant écriture (clé gardée hors de la VM et de F:). **Test de restauration** documenté.

**Livrable B** : version **0.19.0** ; migrations 009-010 appliquées par `install.sh`.

---

## Lot C — Validation par l'enseignant

### C1. Schéma (migration `011_validations.sql`)
```sql
CREATE TABLE IF NOT EXISTS validations (               -- journal (append-only)
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  profile_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NULL,
  surah TINYINT UNSIGNED NOT NULL,
  ayah SMALLINT UNSIGNED NOT NULL,
  result ENUM('acquired','acquired_error','review','cleared') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_val_profile (profile_id, organization_id, created_at),
  CONSTRAINT fk_val_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_val_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_state (          -- dernier état par ayah (lecture rapide)
  organization_id CHAR(36) NOT NULL, profile_id CHAR(36) NOT NULL,
  surah TINYINT UNSIGNED NOT NULL, ayah SMALLINT UNSIGNED NOT NULL,
  result ENUM('acquired','acquired_error','review') NOT NULL,
  teacher_id CHAR(36) NULL, updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (organization_id, profile_id, surah, ayah),
  CONSTRAINT fk_vs_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (             -- centre de notifications dans l'app
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind VARCHAR(30) NOT NULL,                           -- 'validation' | 'certificate' …
  title VARCHAR(160) NOT NULL, body VARCHAR(400) NOT NULL DEFAULT '',
  payload TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  KEY idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### C2. Règles et API
- `PUT /orgs/:id/students/:pid/validation` : corps `{ items:[{surah,ayah,result}] }` **ou** `{ page, result }` (D11 : par ayah **ou** par page) ;
  transaction : journal + état + **notification** à l'élève si une **page bascule** « à reprendre » (≥ `error_threshold` ayat `acquired_error` sur la page, D4)
  ou si un ayah passe « à revoir ».
- `GET /me/validations?organizationId=` : état validé de l'élève ; si l'élève est dans plusieurs établissements, **la validation la plus récente** s'affiche (D5/16) ;
  les rapports d'un établissement ne comptent que **ses** validations.
- `GET /me/notifications`, `POST /me/notifications/read`.
- Fonction pure `pageStatus(page, validations, threshold)` → `ok | partial | retake`, **testée** (2 erreurs → ok ; 3 → reprendre ; seuil 2 ; page à cheval sur 2 sourates).

### C3. App — le mushaf à deux couches (D2)
- Mode **« Validation »** du lecteur Qira'a/Pages pour l'enseignant : choisir l'élève, puis toucher un ayah (cycle : acquis → acquis avec erreur → à revoir → effacé) ou
  « valider la page ». Couleurs de fond (dorée / orange / rouge) + **bandeau « صفحة للإعادة »** en tête d'une page à reprendre.
- Côté élève : le même mushaf affiche la couche **enseignant** (fond) et conserve sa **marque personnelle** « à réviser » (**privée** : jamais exposée à l'équipe, D15) : **anneau + point sur le médaillon du numéro
  d'ayah**, visible sur n'importe quel fond. Légende affichée. Nouvelle option de colorisation « Validation » ; palette daltonien.
- Centre de notifications (cloche + pastille, liste, marquer lu). *Alerte app fermée → lot G.*
- Tests : `ayah_coloring_test.dart` étendu (lisibilité, teintes distinctes entre elles et du papier), tests des deux couches indépendantes.

**Livrable C** : version **0.20.0**.

---

## Lot D — BO nouvelle génération (arabe/français, rapports, exports)

| Tâche | Détail |
|---|---|
| **D1** i18n BO | Mécanisme `tr()` + dictionnaire (calqué sur l'app), **arabe par défaut** (D12), sélecteur de langue, `dir="rtl"` et **propriétés CSS logiques** (`margin-inline`, `padding-inline`…) ; test de couverture des clés |
| **D2** Mosaïque 604 | Commutateur **604 pages / 114 sourates** (604 par défaut) ; données de pages embarquées (copie de `mushaf_pages.json`) ; page « acquise » = tous ses ayat validés |
| **D3** « متابعة » (suivi) | Liste des élèves d'une classe : dernière validation, rythme, pages à reprendre, alerte « sans progrès depuis N jours » |
| **D4** Classements (D7, équipe seulement) | Par classe et par établissement ; colonnes : حفظ إجمالي (ahzab/sourates), حفظ مسترسل (ahzab/sourates), ayat, rang, âge, ancienneté, concours ; **périodes** mois / trimestre / semestre / année (gain sur la période calculé depuis le journal `validations`) ; `GET /orgs/:id/reports/ranking?scope=&groupId=&period=` |
| **D5** Rythme (14) | Courbe d'ayat validés par semaine/mois par élève ; moyenne sur la période |
| **D6** Élite (15, D7, D18) | Liste « élèves d'élite » (critères paramétrables : rang, régularité, progression) **visible de l'équipe seulement** ; trois actions : **message d'encouragement** (notification), **certificat** (circuit du lot E), **cadeau** (suivi « à remettre / remis ») — voir D8 ci-dessous |
| **D7** Exports (D8) | **Excel (.xlsx)** et **Word (.docx)** : bibliothèques côté BO (versions à fixer, ≥ 2 semaines d'ancienneté), mise en page RTL, police arabe ; le CSV existant est conservé |

**D8 Récompenses** (migration `013_rewards.sql`, brouillon) :
```sql
CREATE TABLE IF NOT EXISTS rewards (
  id CHAR(36) NOT NULL PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  profile_id CHAR(36) NOT NULL,
  kind ENUM('message','certificate','gift') NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(400) NOT NULL DEFAULT '',
  certificate_id CHAR(36) NULL,                         -- lien avec la table certificates (lot E) si kind = 'certificate'
  gift_status ENUM('to_give','given') NULL,             -- seulement pour kind = 'gift'
  given_on DATE NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rewards_profile (profile_id, created_at),
  CONSTRAINT fk_rw_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_rw_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
Message et certificat déclenchent une notification à l'élève ; un cadeau n'est visible de l'élève que s'il est marqué « remis » (pas de spoiler).
Dépend du lot E pour le certificat : livrer D6 sans certificat d'abord (message + cadeau), ajouter le certificat avec le lot E.

**Livrable D** : BO déployé (`install.sh`), version **0.21.0**.

---

## Lot E — Résultats d'examens, concours et certificats (D9)

- Migration `012_assessments.sql` : `assessments(id, organization_id, profile_id, kind ENUM('exam','competition'), title, held_on, score, rank_text, created_by, created_at)` ;
  `certificates(id, organization_id, profile_id, assessment_id NULL, title, issued_on, file_name, mime, size_bytes, uploaded_by, created_at, notified_at)`.
- **Stockage** : `/var/lib/hifidh/certificates/<organisation>/<uuid>` (pas dans `/var/www`) ; types **PDF / JPG / PNG**, taille limitée (≈ 5 Mo) ; nouvelle dépendance
  `@fastify/multipart` (version à vérifier à l'installation). **Téléchargement uniquement via l'API authentifiée** (élève lié, enseignant concerné, admin de l'établissement).
- API : `POST/GET/DELETE /orgs/:id/students/:pid/assessments`, `POST …/certificates` (multipart), `GET /me/assessments`, `GET /me/certificates`, `GET /me/certificates/:id/file`.
  À l'ajout d'un certificat : **notification** à l'élève (D9).
- App : écrans **« Mes résultats »** et **« Mes certificats »** (historique complet, date, ouverture/partage).
- BO : onglet « Résultats » dans la fiche élève ; téléversement des certificats.
- **Sauvegarde** : étendre `deploy/backup.sh` aux dossiers `certificates/` (et `audio/` s'il n'est pas reconstructible) ; vérifier l'espace disque (~14 Go libres).

**Livrable E** : version **0.22.0**.

---

## Lot F — Audio (D10)

1. Recevoir les MP3 (une sourate par fichier) des deux récitateurs + **conserver la preuve écrite** de leur accord.
2. Téléverser dans `/var/lib/hifidh/audio/<id>/` (voir A6) ; vérifier durée et complétude (114 fichiers, ou la liste des sourates disponibles).
3. Déclarer les récitateurs dans `reciters.json` avec `timings: false` (A5) : **disponibles immédiatement** en mode sourate entière.
4. **Minutages** (travail le plus long) : outil de marquage (écouter + touche à chaque début d'ayah) ou alignement automatique à évaluer ; produire
   `mobile/assets/data/timings/<id>.json` (même format que les 16 existants : `{"surahs":{"1":[[ayah,début_ms,fin_ms],…]}}`) ; passer `timings: true`.

---

## Lot G — Alertes quand l'app est fermée (après C)

Mutualisé avec le rappel de prière : push natif (Firebase) pour l'app native, **Web Push + clés VAPID** pour la PWA (iPhone : PWA installée, iOS ≥ 16.4). À décider avec Anis (compte Firebase, clés,
permissions Android 13+).

---

## Ordre d'attaque proposé pour demain matin

| # | Action | Résultat vérifiable |
|---|---|---|
| 1 | Relire ce plan et le §4 de l'analyse (toutes les décisions D1-D20 sont prises) ; **vérifier la disponibilité du nom « حفظ قالون »** dans les deux stores | Nom confirmé ou repli sur « تحفيظ قالون » |
| 2 | `git pull` ; vérifier `git status` propre ; sauvegarde de la base avant migrations (`sudo /usr/local/bin/hifidh-backup`) | Dump daté dans `/var/backups/hifidh` |
| 3 | **Lot A** : A1 → A2 → A3 → A4 → A5 (code + tests + i18n arabe) | analyse, tests OK |
| 4 | Build web + **déploiement 0.18.0** ; vérifier `/app/` (Pages par défaut, arabe par défaut) | version.json = 0.18.0 |
| 5 | **Lot B1-B2** : données de référence + migrations 009-010 (tests serveur sur base de test d'abord) | `npm test` serveur vert |
| 6 | B3-B4 : API orgs + calculs (tests d'isolation et de la propriété successif ≤ global) | tests verts |
| 7 | B5-B6 : pages BO « Établissements / Classes / Élèves » + écran app ; déploiement **0.19.0** | Créer une association, une classe, un élève de bout en bout |
| 8 | Lot C si le temps le permet, sinon lendemain | — |

En parallèle, côté Anis : MP3 des deux récitateurs (+ preuve d'accord écrite), vérification du nom dans les stores, mise en place de la liaison VM ↔ F: (Hyper-V) et conservation de la clé de chiffrement des sauvegardes.

## Définition de « terminé » (par lot)
Code + tests · arabe/français complets · couleurs vérifiées (daltonisme) · déployé · version incrémentée · documentation à jour (`CONCEPTION.md`,
`A-FAIRE-APRES-SERVEUR.md`) · mémoire projet mise à jour si l'architecture change.
