# Évolutions demandées — Compte rendu « Réunion 1 » (jam3a / KM)

Source : demandes de **Wajdi** et **Amine** après la première réunion, transmises par Anis (17/10/2026).
Ce document **analyse** les 23 points (état actuel du code, effort, risques, questions ouvertes) et
propose un **ordre de réalisation**. Rien n'est codé ici : les décisions marquées ❓ doivent être
validées avant de commencer les lots concernés.

> Vocabulaire : **جمعية** = association · **جامع** = mosquée · **قاعة** = salle · **فوج** = groupe/classe ·
> **حلقة تحفيظ** (pl. حلق) = cercle de mémorisation · **إداري / مدرس / طالب** = administratif / enseignant / élève ·
> **حفظ إجمالي** = mémorisation globale · **حفظ مسترسل** = mémorisation successive (continue) · **مصحف** = mushaf ·
> **متابعة** = suivi.

---

## 0. Décisions prises (Anis, 17/10/2026)

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Mémorisation successive (مسترسل) comptée en ahzab et en sourates** | Deux valeurs successives : plus longue suite de **ahzab entiers** consécutifs et plus longue suite de **sourates entières** consécutives (ordre du mushaf). Un hizb ou une sourate **partiel** ne compte pas. Chaque valeur reste ≤ au total correspondant (حفظ إجمالي, exprimé dans la même unité). Les ayat/pages restent affichés comme information complémentaire. |
| D2 | **Le marquage de l'enseignant fait foi** (rapports + mushaf de l'élève) ; **l'élève garde son propre marquage « à réviser »**, visuellement distinct | Deux couches indépendantes : *validation enseignant* (officielle, comptée) et *marque personnelle de l'élève* (privée, jamais comptée dans les rapports). Voir §2.B pour le rendu visuel recommandé. |
| D3 | **Vérification du téléphone par message WhatsApp, en commençant simple** | Phase 1 : code à usage unique envoyé par WhatsApp via un lien pré-rempli, sans compte externe ni coût. Phase 2 : envoi automatique (WhatsApp Business). Voir §2.A. |

| D4 | **Seuil des erreurs : 3 ayat avec erreur sur la même page → page à reprendre ; seuil réglable par association** | `organizations.error_threshold` (défaut 3). La règle est évaluée **par page** et **par association**. |
| D5 | **Une personne peut appartenir à plusieurs associations/mosquées ; un élève à plusieurs classes** | Rôles **par établissement**, tables d'appartenance plusieurs-à-plusieurs. Les validations portent l'établissement qui les a posées (voir risque « validations concurrentes », §5). |
| D6 | **Mosquée et association : mêmes écrans** | Un seul modèle ; seul le **libellé** change (association : قاعة / فوج ; mosquée : حلقة / فوج). |
| D7 | **Classements visibles par l'équipe seulement (إداري / مدرس)** | Aucun écran de classement côté élève. Les élèves et les mineurs : **les parents utilisent leur compte** (pas d'accès propre aux classements). Le point 15 (élèves d'élite) devient une liste **réservée à l'équipe**. |
| D8 | **Exports : Excel (.xlsx) et Word (.docx)** | Génération côté BO (RTL arabe) ; le CSV actuel est conservé. Pas de PDF. |
| D9 | **Certificats téléversés par l'administratif ; l'élève est notifié et garde l'historique de tous ses certificats** | Table de certificats + stockage de fichiers + notification + écran « Mes certificats ». |
| D10 | **Récitateurs : accord acquis pour كمال صميدة et نور الدين المسلاتي ; MP3 par sourate hébergés sur notre serveur** | Réponse à « mieux d'uploader les MP3 ? » : **oui**, voir §2.G. Reste la production des **minutages**. |
| D11 | **Mode « Page » par défaut pour tout le monde ; marquage par page ET par ayah acceptés** | Marquer « une page entière » en un geste (app) ; la validation enseignant accepte aussi page ou ayah. |
| D12 | **BO en arabe par défaut** | BO bilingue AR/FR, arabe (RTL) par défaut. |

| D13 | **Données des enfants : les parents autorisent lors de l'inscription** | Le consentement est **recueilli à l'inscription** de l'élève et **tracé** (`guardian_consent_at`) ; case obligatoire dans le formulaire du BO. |
| D14 | **Identifiant élève : clé technique interne + alerte de doublon** (même nom + même prénom du père) | Validé. Le téléphone normalisé reste un identifiant « métier » facultatif. |
| D15 | **La marque personnelle « à réviser » de l'élève est privée : l'enseignant ne la voit pas** | Aucune route de l'équipe ne renvoie les marques personnelles (`memorized_ayahs` du compte de l'élève). Elles ne servent qu'à l'élève. |
| D16 | **Nom de l'app : 1er choix « حفظ قالون » (Hifdh Qalun), 2ᵉ choix « تحفيظ قالون » (Tahfidh Qalun)** | Disponibilité à vérifier dans Google Play et l'App Store avant application ; en cas d'indisponibilité, passer au 2ᵉ choix. |
| D17 | **Les élèves n'ont pas forcément d'e-mail, mais le parent peut en créer un pour son enfant** | Compte par enfant avec l'e-mail créé par le parent ; le **profil** créé par l'administratif se rattache au compte par un **code de liaison**. Pas d'e-mail obligatoire pour être inscrit. |

| D18 | **Élèves d'élite : message d'encouragement + certificat + cadeau** (liste réservée à l'équipe) | Table de **récompenses** (message, certificat, cadeau avec suivi « remis / à remettre »). L'élève est notifié du message et du certificat ; le cadeau est remis hors application et simplement tracé. |
| D19 | **Deux associations : l'élève voit la validation la plus récente ; chaque association ne compte que les siennes** | Règle confirmée (voir risque « validations concurrentes », §5). |
| D20 | **Conservation : les données d'un élève sorti sont gardées 5 ans au moins** | Statut « sorti » + date de sortie ; **aucune suppression automatique** ; purge possible seulement après 5 ans, à la main par un administrateur ; **sauvegardes longue durée** (voir §5). |

| D21 | **La copie de sauvegarde longue durée est stockée sur F: (lecteur de l'hôte Windows qui héberge la VM Hyper-V)** | Ce n'est **pas** un stockage hors site au sens strict : il protège d'une panne du disque de la VM ou d'une perte de son disque virtuel, **pas** d'un vol, d'un incendie, d'une panne de l'hôte ou d'un rançongiciel sur l'hôte. **Mécanisme retenu : disque virtuel Hyper-V « Backup U » (VHDX, 50 Go) créé sur F:, disque physique distinct de celui de la VM** ; ajouté à la VM puis monté côté Linux (procédure : plan, B7). Une 2ᵉ copie réellement distante reste recommandée. |

Aucune question bloquante ne reste (§4).

---

## 1. Synthèse

Les demandes transforment l'outil d'un **suivi personnel + groupes d'étude** en une **plateforme de gestion
d'établissements de tahfidh** (association ou mosquée → classes/halaqat → élèves, enseignants,
administratifs) avec **validation de la mémorisation par l'enseignant**, **rapports** et **classements**.

Trois constats :
1. **Un seul vrai chantier structurant** : le modèle « établissement → classes → rôles » (points 1-5) ;
   la validation par l'enseignant (6-7), les rapports (10-15) et les résultats d'examens (17) en dépendent.
2. **Plusieurs points sont rapides et indépendants** : mode « Page » (8), langue par défaut arabe (21),
   estimateur de khatma (23), récitateurs (19-20), choix du nom (18).
3. **Le point 22 est déjà livré** (inscription ouverte sans invitation).

### État par point

Légende : ✅ fait · 🟡 partiel (une base existe) · 🆕 nouveau · ❓ décision/validation externe requise.
Effort : **S** (≤ 1 jour) · **M** (2-4 jours) · **L** (≥ 1 semaine).

| # | Demande | État | Où | Effort |
|---|---|---|---|---|
| 1 | Établissement (association/mosquée) → salles/halaqat/fawj | 🟡 | BDD, API, BO, app | L |
| 2 | Acteurs : إداري، مدرس، طالب | 🟡 | BDD, API, BO, app | L |
| 3 | Identifiant élève : nom complet + prénom du père, ou tél. (vérifié) | 🆕 ❓ | BDD, API | M |
| 4 | Adresse (مقر الإدارة) de l'établissement | 🆕 | BDD, BO | S |
| 5 | Fiche administrative de l'élève (11 champs) | 🟡 | BDD, API, BO | M |
| 6 | Validation du حفظ par le مدرس | 🆕 | BDD, API, app | L |
| 7 | Conception de la validation (mushaf enseignant, règle des 3 erreurs, notification) | 🆕 ❓ | BDD, API, app | L |
| 8 | Mode « Page » (par défaut) à côté de Sourates et Juz/Hizb | 🟡 | app | S |
| 9 | Admin : 604 cases par défaut (114 possible) | 🟡 | BO | M |
| 10 | Rapports : حفظ إجمالي ≥ حفظ مسترسل | 🆕 ❓ | API, BO | M |
| 11 | Rubrique « متابعة » (suivi des élèves) | 🆕 | BO | M |
| 12 | Classements par classe et par établissement ; périodes mois/trimestre/semestre/année | 🆕 | API, BO | L |
| 13 | Export des rapports | 🟡 | BO | M |
| 14 | Suivi du rythme de hifdh par élève | 🆕 | BDD, API, BO | M |
| 15 | Encourager les élèves « élites » | 🆕 ❓ | BO, app | S-M |
| 16 | BO en arabe et en français | 🆕 | BO | M |
| 17 | L'élève voit ses notes d'examens/compétitions, dates, certificats | 🆕 | BDD, API, app, BO | L |
| 18 | Nouveau nom d'app (3 propositions) | ❓ | tout | S |
| 19 | Récitateur كمال صميدة | 🆕 ❓ | app, données | M |
| 20 | Récitateur نور الدين المسلاتي | 🟡 | données | S-M |
| 21 | Langue par défaut : arabe | 🟡 | app | S |
| 22 | Compte simple sans invitation | ✅ | — | — |
| 23 | Estimateur de durée de la khatma | 🆕 | app | S-M |

---

## 2. Analyse détaillée

### A. Modèle établissement / classes / rôles (points 1-5)

**Existant** (voir `docs/CONCEPTION.md`) : rôles globaux `user` / `admin` ; `study_groups` (un groupe a des
membres, des admins de groupe, un code d'adhésion activable) ; `memorized_ayahs` par utilisateur.
Le « groupe » actuel correspond fonctionnellement à une **classe/halaqa**, mais il n'existe ni niveau
« établissement », ni rôle enseignant/élève, ni fiche administrative.

**Proposition de modèle** (à valider, ne casse pas l'existant) :
- `organizations` : `id, name, type (association|mosque), address, created_at`.
- `study_groups` (existant) reçoit `organization_id` (nullable) et `kind` (salle/fawj/halqa — simple libellé d'affichage :
  *association* → « قاعة / فوج », *mosquée* → « حلقة / فوج »). Les groupes d'étude libres actuels restent valides.
- `org_members` : `organization_id, user_id, role (admin|teacher|student)` — le rôle est **par établissement** (une même
  personne peut être enseignante dans l'un, élève dans un autre).
- `group_members` reçoit aussi un rôle (`teacher|student`) pour affecter enseignants et élèves aux classes.
- `student_profiles` : fiche administrative (point 5), séparée de `users` pour que les comptes « simples » restent légers.

Fiche élève (point 5) — **champs stockés** : identifiant, nom et prénom, prénom du père, **date de naissance**
(on stocke la date, pas l'« âge », qui change chaque année), sexe, date d'adhésion, date de début de hifdh,
participations précédentes à des concours. **Champs calculés** (jamais saisis à la main) : حفظ إجمالي,
حفظ مسترسل, **rang** (point 12).

❓ **Identifiant unique (point 3).** « Nom complet + prénom du père » **n'est pas unique** (homonymes fréquents) et
change de graphie (variantes d'écriture arabe/latine). Recommandation : **clé technique interne** (UUID, déjà le cas
pour `users`) + **détection de doublons** à la saisie (même nom + même père) + téléphone normalisé (format
international) comme identifiant « métier » facultatif. La demande « vérifier le téléphone après chaque changement »
suppose l'envoi d'un **code à usage unique**.

✅ **Décision D3 : par message WhatsApp, en deux phases.**
- **Phase 1 (simple, sans coût, sans compte externe)** : à chaque ajout ou changement de numéro, le serveur génère un code
  (6 chiffres, valable 15 min, 5 essais) et le numéro reste « **non vérifié** » tant que le code n'est pas saisi. L'administratif
  (ou l'enseignant) envoie le code à l'élève par WhatsApp en un geste, avec un lien `wa.me` au message pré-rempli — le même principe que
  le partage des invitations déjà présent dans le BO. L'élève saisit le code dans l'app : le numéro devient « vérifié ».
- **Phase 2 (automatique, plus tard)** : envoi direct par la **WhatsApp Business Platform (Cloud API)** avec un modèle de message
  d'« authentification ». Pré-requis : compte Meta Business vérifié, numéro dédié, modèle approuvé par Meta, et **messages
  facturés** (tarifs par pays à consulter sur la page officielle de Meta ; non vérifiés ici). À décider quand le volume le justifie.
- Limite de la phase 1 : elle prouve que l'élève reçoit les messages à ce numéro, mais l'envoi n'est pas automatique.

⚠️ **Données de mineurs** : nom, âge, téléphone, résultats. ✅ **Consentement des parents recueilli à l'inscription (D13)** et tracé ; prévoir en plus : politique de
confidentialité (déjà à rédiger pour Google Play), accès limité (un enseignant ne voit que ses classes), et **ne pas
exposer les classements aux autres élèves sans accord** (voir point 15).

### B. Validation par l'enseignant (points 6-7) — le cœur du projet

**Besoin reformulé.** Aujourd'hui l'élève s'auto-marque (rouge = en cours, etc.). Il faut une **validation
indépendante par le مدرس**, visible dans le mushaf de l'élève.

**Proposition de conception :**
- L'enseignant ouvre le **mushaf de l'élève** (même lecteur 604 pages, **couleur/pastille distincte** de l'auto-marquage)
  et pose pour chaque ayah : *acquis* / *acquis avec erreur* / *à revoir*.
- **Règle de page** (telle que décrite) : si **≥ 3 ayat « acquis avec erreur »** sur une page → **toute la page est
  « à reprendre »**. Le seuil (3) sera un **paramètre** de l'établissement plutôt qu'une constante.
- **Propagation à l'élève** : à l'enregistrement, l'élève reçoit une **notification** ; son mushaf affiche les pages
  « à reprendre » et les ayat « à revoir » avec un **marqueur différent du rouge** (le rouge reste l'auto-marquage de l'élève).
- **Données** : table `validations` (`student_id, teacher_id, surah, ayah, result, error_flag, created_at`) + vue
  « statut de page » dérivée. L'historique est **conservé** (journal), ce qui sert aussi aux rapports (points 10, 12, 14).

✅ **Décision D2** : le marquage de l'enseignant est **le seul à compter** dans les rapports (حفظ إجمالي / مسترسل, classements,
rythme) et il s'affiche dans le mushaf de l'élève. L'élève conserve son marquage « à réviser » (personnel, non compté).
Un compte **sans établissement** (utilisateur seul, sans enseignant) garde le fonctionnement actuel : ses propres marques
comptent pour sa propre progression.

**Rendu visuel recommandé — deux couches qui peuvent coexister sur le même ayah.** Ne pas se contenter d'une autre *couleur* :
le texte utilise déjà les couleurs du tajwid, le fond sert à la colorisation, et une couleur seule est illisible pour les
daltoniens (palette adaptée déjà prévue). On distingue donc par le **canal** (forme / emplacement), pas seulement par la teinte :

| Couche | Qui | Où | Rendu |
|---|---|---|---|
| **Validation enseignant** | مدرس | **fond de l'ayah** (système de colorisation existant, nouveau mode « Validation ») | acquis (doré/vert) · acquis avec erreur (orange) · à revoir (rouge) ; bandeau « صفحة للإعادة » en tête d'une page à reprendre ; petite pastille « مدرس » dans la légende |
| **Marque personnelle « à réviser »** (privée, D15) | élève | **médaillon du numéro d'ayah** (l'étoile de fin d'ayah) : anneau + point, et soulignement discret | visible même sur un fond coloré par l'enseignant ; ne modifie pas le fond |

Légende affichée dans le mushaf ; palette daltonien dédiée ; les tests d'accessibilité existants
(`mobile/test/ayah_coloring_test.dart` : lisibilité, fonds distincts entre eux et du papier) sont étendus aux nouvelles teintes.
✅ **Décision D15** : la marque personnelle de l'élève est **privée** — l'enseignant ne la voit pas, et elle n'est jamais comptée.

❓ **À trancher avec Wajdi/Amine** : « avec erreur » est marqué par l'enseignant **par ayah** ? Le décompte « ≥ 3 » se fait-il **par page** ?

**Notifications.** Les alertes **dans l'app** (centre de notifications, pastille) sont simples et fonctionnent sur
l'app native **et** la version web. Une alerte **quand l'app est fermée** exige : notifications push (Firebase) côté
natif, **Web Push + clés VAPID** côté PWA (iPhone : PWA installée sur l'écran d'accueil, iOS ≥ 16.4). Même chantier
que le rappel de prière « app fermée » (Phase 2, déjà identifié) → **à mutualiser**.

### C. Navigation : mode « Page » (point 8)
**Existant** : l'onglet Lire a deux vues (Sourates, Juz et hizb) ; le mode de lecture « Qira'a » affiche déjà les **604
pages du mushaf de Qalun** (`mobile/assets/data/mushaf_pages.json`). Il manque une **3ᵉ vue « Pages »** (liste/grille de
604 pages avec leur avancement), à placer **en premier**. ❓ « par défaut » pour **tout le monde** ou seulement pour le
rôle enseignant ? Recommandation : défaut pour les enseignants/élèves d'un établissement, sinon inchangé.

### D. Rapports, classements, suivi (points 9-15)
- **Mosaïque admin 604 cases (9)** : le BO ne connaît aujourd'hui que les 114 sourates (`admin/src/lib.ts`,
  `components.tsx`). Il faut y embarquer la table des 604 pages (copie de `mushaf_pages.json`) et un commutateur 114 / 604.
  Une page est « acquise » quand **tous** ses ayat le sont (ou validée, selon la décision B.3).
- **حفظ إجمالي vs مسترسل (10)** — ✅ **Décision D1** : unités = **ahzab** et **sourates**.
  *Global* = nombre total de ahzab entiers (et de sourates entières) acquis ; *successif* = **plus longue suite ininterrompue**
  de ahzab entiers (resp. de sourates entières) dans l'ordre du mushaf. Par construction **successif ≤ global** dans chaque unité
  (à tester automatiquement). Les bornes des ahzab existent déjà (`mobile/assets/data/divisions.json`). Calcul à partir des ayat
  **validés par l'enseignant** (D2), triés par ordre de mushaf.
  Hypothèse par défaut, à confirmer : la suite peut commencer **n'importe où** (elle n'est pas obligatoirement ancrée à la
  Fatiha ou à An-Nas).
- **Périodes (12)** (mois/trimestre/semestre/année) et **rythme (14)** exigent un **historique des événements**.
  Aujourd'hui `memorized_ayahs` ne garde que la **dernière** date par ayah (une annulation puis re-mémorisation écrase
  l'histoire). → ajouter une table d'**événements de mémorisation** (journal append-only), à mettre en place **tôt**
  car l'historique ne se reconstitue pas après coup.
- **Classements (12)** par classe et par établissement, avec les colonnes de la fiche. Calcul côté serveur.
- **Rubrique « متابعة » (11)** : écran du BO (liste des élèves, dernière activité, alertes « sans progrès depuis N jours »,
  rythme, pages à reprendre).
- **Export (13)** : un export CSV existe déjà pour les utilisateurs. À étendre aux rapports ; ❓ formats voulus : **CSV/Excel**
  (simple) et/ou **PDF** (le PDF arabe demande une police intégrée — Scheherazade / Readex Pro, déjà dans le projet).
- **Élèves d'élite (15, D7 + D18)** : liste **réservée à l'équipe** (critères paramétrables : rang, régularité, progression). Actions de
  récompense : **message d'encouragement** (notification à l'élève), **certificat** (même circuit que le point 17), **cadeau** (remis
  physiquement ; l'équipe note « à remettre » / « remis » avec la date). L'élève ne voit jamais de classement (D7), seulement ce qu'il reçoit.
  Mettre en avant les **progrès** autant que le rang, pour ne pas décourager les autres.

### E. Interface BO bilingue (16)
Le **BO est en français seul** (l'app mobile est déjà FR/AR avec `tr()` + dictionnaire `i18n_ar.dart`). À faire : mécanisme
de traduction équivalent dans `admin/src`, **mise en page RTL** (propriétés CSS logiques, `dir="rtl"`), sélecteur de langue,
test de couverture des clés (comme `mobile/test/i18n_test.dart`). ❓ Langue par défaut du BO : arabe (cohérent avec le point 21) ?

### F. Résultats de l'élève (17)
Entités : `assessments` (`student_id, type = examen|concours, titre, date, note/rang, certificate_url`). Les certificats
sont des **fichiers** (PDF/image) : stockage serveur + droit d'accès strict (élève concerné, enseignant, admin). ❓ Les
certificats sont-ils **téléversés** par l'administratif ou **générés** par l'app ?

### G. Application (points 18-23)
- **18 — Nom.** Le nom technique (`com.bestconsultingit.hifidh_quran`, service `hifidh-api`, base `hifidh`) **ne change
  pas** ; seul le nom d'affichage, l'icône et les textes changent. Je **ne peux pas vérifier** la disponibilité sur Google
  Play / App Store depuis ce poste : à contrôler par recherche dans les deux stores + recherche de marque avant adoption.
  ✅ **Choix d'Anis (D16)** : **1. « حفظ قالون » (Hifdh Qalun)**, **2. « تحفيظ قالون » (Tahfidh Qalun)** ; disponibilité à vérifier avant application.
  Les trois propositions initiales (mention « Qalun » pour se distinguer des nombreuses apps génériques de Coran) étaient :
  1. **« Maqraa Qalun — مقرأة قالون »**
  2. **« Hifdh Qalun — حفظ قالون »**
  3. **« Tahfidh Qalun — تحفيظ قالون »**
  (variante institutionnelle : « Almoyassir Qalun — الميسّر قالون », qui garde la marque actuelle.)
- **19 — كمال صميدة** et **20 — نور الدين المسلاتي.**
  - *Déjà présent* : المسلاتي (`nooreddine_almeslati`, source archive.org) couvre **53 sourates sur 114**. La vidéo « الختمة
    الكاملة » pourrait combler les 61 manquantes ; كمال صميدة n'est pas encore dans l'app.
  - ⚠️ **Droits** : l'audio vient de YouTube. **Télécharger des vidéos YouTube contrevient aux conditions d'utilisation de
    YouTube** et les enregistrements sont protégés. Il faut **l'accord du récitateur** (idéalement les fichiers MP3 fournis par lui)
    avant toute intégration ; les pistes actuelles sont, elles, hébergées sur un miroir tiers (`quran-audio.abdeljawad.com`).
  - ⚠️ **Technique** : la lecture **ayah par ayah** (répétition, suivi) repose sur un **fichier de minutages par sourate et
    par récitateur** (`mobile/assets/data/timings/`). Un nouveau récitateur sans minutages ne pourrait jouer que des sourates entières.
    Les produire demande un alignement (manuel ou outil d'alignement forcé) : c'est l'essentiel de l'effort (M).
  - ✅ **Accord acquis (D10)** : héberger **vous-même les MP3, une sourate par fichier** est la bonne démarche (jamais de lien
    YouTube dans l'app). Gardez une **preuve écrite** de l'autorisation des deux récitateurs (message WhatsApp/e-mail avec
    leur accord pour la diffusion dans l'application) : c'est ce qui répond à une éventuelle réclamation de droits d'auteur.
    Je ne peux pas garantir ce que décidera Google Play, mais une plainte repose sur l'absence d'autorisation, que cela couvre.
  - **Format conseillé** : MP3 mono 64 kbps (~0,5 à 0,7 Go la khatma complète, estimation à vérifier sur vos fichiers), un fichier
    par sourate nommé `001.mp3` … `114.mp3`, comme les autres récitateurs. Stockage : `/var/lib/hifidh/audio/<id_récitateur>/`, servi par nginx
    (lecture partielle/seek supportée). Débit : la VM est derrière une connexion domestique (envoi limité) → surveiller l'usage.
  - **Minutages** : aucun script de génération n'existe dans le dépôt (les 16 fichiers actuels viennent d'un projet externe). Trois voies :
    (a) **outil de marquage** : écouter le MP3 et frapper une touche à chaque début d'ayah ; (b) alignement automatique texte/audio
    (à tester sur la récitation de Qalun, exactitude non garantie) ; (c) **repli immédiat** : récitateur « sourate entière » sans
    suivi ayah par ayah, en attendant les minutages. Le plan prévoit (c) d'abord.
- **21 — Arabe par défaut** : `Settings.language` vaut `'system'` ; passer à `'ar'` quand le réglage n'a jamais été choisi
  (les utilisateurs ayant déjà choisi une langue ne changent pas). Trivial.
- **22 — Compte sans invitation** : **déjà livré** (inscription ouverte, récupération par mot de passe oublié, même compte
  sur l'app et la version web). Reste à vérifier avec les utilisateurs que la progression se retrouve bien après changement de téléphone.
- **23 — Estimateur de khatma** : écran 100 % local (app + web). Questions posées : jours/semaine disponibles, durée par séance,
  rythme (ayat nouveaux par séance, ou « lent / moyen / soutenu »), part de révision, ayat déjà acquis. Résultat : **durée
  estimée (jours/mois/années)** et **date probable** ; option « utiliser mon rythme réel » une fois l'historique (point 14) disponible.

---

## 3. Ordre de réalisation proposé

| Lot | Contenu | Points | Dépend de |
|---|---|---|---|
| **A — Gains rapides** | Langue par défaut arabe · vue « Pages » · estimateur de khatma · vérification المسلاتي · choix du nom | 21, 8, 23, 20, 18 | — |
| **B — Fondations de données** | Établissements/classes/rôles · fiche élève · journal d'événements de mémorisation · adresse · calculs global/successif | 1-5, 10, 14 (base) | D1-D3 ✅ ; reste : questions 5, 6 (§4) |
| **C — Validation enseignant** | Mushaf enseignant · règle des 3 erreurs · centre de notifications dans l'app · marqueurs côté élève | 6, 7 | B |
| **D — BO nouvelle génération** | Mosaïque 604 · « متابعة » · classements · périodes · export · BO FR/AR | 9, 11-13, 15, 16 | B (C pour le « validé ») |
| **E — Résultats** | Examens, concours, certificats | 17 | B |
| **F — Audio** | كمال صميدة + compléments المسلاتي (après accord) | 19, 20 | accord des récitateurs + minutages |
| **G — Alertes app fermée** | Push natif + Web Push (mutualisé avec les rappels de prière) | 7, rappels | C |

Lot **A** peut démarrer immédiatement. Le lot **B** doit être validé avant tout développement (il conditionne le reste).

## 4. Questions pour Wajdi et Amine

**Toutes tranchées** : D1 à D20 (§0). Aucune question bloquante ne reste.
Points de détail réglés par défaut (modifiables sans refonte) : la purge après 5 ans est **manuelle** (jamais automatique) ;
une demande de suppression d'un parent est traitée par un administrateur.

## 5. Risques

- **Périmètre** : c'est un nouveau produit (gestion d'établissements) greffé sur l'app existante — à livrer par lots, pas d'un bloc.
- **Historique perdu** : tant que le journal d'événements n'existe pas, aucun rapport par période n'est fiable → à poser dès le lot B.
- **Droits audio** (point 19) et **données de mineurs** (points 3, 5, 12, 17) : risques juridiques à traiter **avant** le développement.
- **Validations concurrentes** (D5) : un élève dans deux associations peut avoir deux enseignants qui valident le même ayah.
  Règle proposée : chaque association compte ses validations ; le mushaf de l'élève affiche la plus récente (question 16).
- **Fichiers hors base** (certificats, MP3) : `deploy/backup.sh` ne sauvegarde **que la base** ; à étendre aux certificats avant le lot E.
  Espace disque libre sur la VM : ~14 Go.
- **Conservation ≥ 5 ans (D20) et sauvegardes** : `deploy/backup.sh` ne garde que **14 jours** de sauvegardes de la base, sur le même disque
  que la base (la VM est un serveur domestique : une panne disque perdrait tout). Pour tenir 5 ans il faut : (1) un **dump mensuel conservé
  ≥ 5 ans**, (2) une **copie chiffrée sur F: (D21)**, idéalement doublée plus tard d'une copie réellement distante (disque externe rangé ailleurs ou stockage en ligne), (3) un **test de restauration** périodique.
  Les demandes de suppression de parents doivent être arbitrées avec la durée de conservation (à valider avec le cadre juridique applicable ;
  ce document n'est pas un avis juridique).
- **Compatibilité** : les comptes et groupes actuels doivent continuer à fonctionner (colonnes nullables, migrations additives).

## 6. Message WhatsApp pour Wajdi et Amine (à copier-coller)

```
السلام عليكم ورحمة الله،

شكرًا على الاقتراحات. اعتمدنا إلى حد الآن:
✅ الحفظ المسترسل يُحسب بالأحزاب والسور (أطول سلسلة أحزاب كاملة متتالية، وأطول سلسلة سور كاملة متتالية)
✅ تعليم المدرس هو المعتمد في التقارير وفي مصحف الطالب، وللطالب علامته الخاصة للمراجعة بشكل مختلف
✅ التحقق من رقم الهاتف برمز يُرسل عبر واتساب

Bonjour, merci pour les propositions. Déjà retenu : mémorisation successive en ahzab + sourates ; marquage de
l'enseignant = référence (rapports + mushaf de l'élève), l'élève garde sa marque « à réviser » distincte ;
vérification du téléphone par code WhatsApp.

Il me reste quelques questions pour avancer :

1) Erreurs : « 3 ayat avec erreur » = sur la même page ? Seuil réglable par association ?
2) Une personne peut-elle être dans plusieurs associations/mosquées ? Un élève dans plusieurs classes ?
3) Mosquée et association : mêmes écrans avec un simple libellé différent (حلقة / قاعة-فوج), ou règles différentes ?
4) Classements : visibles par les élèves, ou seulement par l'équipe (إداري/مدرس) ? Pour les mineurs : seulement avec accord ?
5) Rapports exportés : Excel/CSV suffit, ou PDF imprimable indispensable ?
6) Certificats : l'administratif les téléverse, ou l'app les génère ? Avez-vous un modèle ?
7) Récitateurs كمال صميدة et نور الدين المسلاتي : ont-ils donné leur accord ? Peuvent-ils fournir les fichiers MP3 ?
   (on ne peut pas utiliser les vidéos YouTube directement)
8) Le mode « صفحة » par défaut : pour tout le monde ou seulement pour les مدرسين ؟
9) Le BO en arabe par défaut ؟
10) Données des enfants (nom, âge, téléphone) : y a-t-il un accord des parents à prévoir ?
11) Identifiant élève : OK pour un identifiant technique interne + alerte en cas de doublon (même nom + même prénom du père) ?
12) Le مدرس peut-il voir la marque personnelle « à réviser » de l'élève ?
13) Nom de l'application — lequel préférez-vous : مقرأة قالون / حفظ قالون / تحفيظ قالون ؟

جزاكم الله خيرًا
```
