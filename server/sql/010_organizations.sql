-- 0.19.0 : établissements (association / mosquée), rôles par établissement, classes, fiches élèves.
-- Migration ADDITIVE : aucune table ni colonne existante n'est supprimée ou modifiée dans son sens ;
-- les groupes d'étude et les comptes actuels continuent de fonctionner tels quels.
-- Voir docs/PLAN-EXECUTION.md (lot B) et docs/EVOLUTIONS-REUNION-1.md (décisions D4-D21).

CREATE TABLE IF NOT EXISTS organizations (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  type            ENUM('association','mosque') NOT NULL,
  address         VARCHAR(255) NOT NULL DEFAULT '',            -- مقر الإدارة
  error_threshold TINYINT UNSIGNED NOT NULL DEFAULT 3,         -- « page à reprendre » à partir de N ayat avec erreur (D4)
  created_by      CHAR(36)     NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_org_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Une personne peut avoir plusieurs rôles, dans plusieurs établissements (D5).
CREATE TABLE IF NOT EXISTS org_members (
  organization_id CHAR(36) NOT NULL,
  user_id         CHAR(36) NOT NULL,
  role            ENUM('admin','teacher','student') NOT NULL,  -- إداري / مدرس / طالب
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, user_id, role),
  KEY idx_org_members_user (user_id),
  CONSTRAINT fk_om_org  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_om_user FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Une classe / halqa / fawj est un groupe d'étude rattaché à un établissement.
ALTER TABLE study_groups
  ADD COLUMN organization_id CHAR(36) NULL AFTER name,
  ADD KEY idx_groups_org (organization_id),
  ADD CONSTRAINT fk_groups_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Enseignants d'une classe : table à part pour ne rien changer au sens de group_members (admin / membre).
CREATE TABLE IF NOT EXISTS group_teachers (
  group_id CHAR(36) NOT NULL,
  user_id  CHAR(36) NOT NULL,
  PRIMARY KEY (group_id, user_id),
  KEY idx_gt_user (user_id),
  CONSTRAINT fk_gt_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_gt_user  FOREIGN KEY (user_id)  REFERENCES users(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fiche administrative de l'élève. Elle existe sans compte : l'administratif la crée, le parent rattache
-- ensuite le compte de l'enfant par un code de liaison (D17).
CREATE TABLE IF NOT EXISTS student_profiles (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  organization_id     CHAR(36)     NOT NULL,
  user_id             CHAR(36)     NULL,
  full_name           VARCHAR(120) NOT NULL,                   -- الاسم واللقب
  father_name         VARCHAR(80)  NOT NULL DEFAULT '',        -- اسم الأب
  birth_date          DATE         NULL,                       -- on stocke la date ; l'âge se calcule
  gender              ENUM('m','f') NULL,
  phone               VARCHAR(20)  NULL,                       -- format international (+…)
  phone_verified_at   DATETIME(3)  NULL,
  joined_at           DATE         NULL,                       -- تاريخ الانخراط
  hifdh_started_at    DATE         NULL,                       -- تاريخ بداية الحفظ
  past_competitions   TEXT         NULL,                       -- مشاركات سابقة
  guardian_consent_at DATETIME(3)  NULL,                       -- autorisation des parents recueillie à l'inscription (D13)
  status              ENUM('active','left') NOT NULL DEFAULT 'active',  -- sorti : archivé, jamais supprimé d'office (D20)
  left_at             DATE         NULL,
  retain_until        DATE         NULL,                       -- left_at + 5 ans : purge manuelle possible après
  link_code_hash      CHAR(64)     NULL,                       -- code de liaison au compte (D17)
  link_expires_at     DATETIME(3)  NULL,
  created_by          CHAR(36)     NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_sp_org_name (organization_id, full_name, father_name),    -- détection de doublons
  KEY idx_sp_user (user_id),
  KEY idx_sp_link (link_code_hash),
  CONSTRAINT fk_sp_org     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_user    FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE SET NULL,
  CONSTRAINT fk_sp_creator FOREIGN KEY (created_by)      REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Élève ↔ classe (un élève peut être dans plusieurs classes, D5).
CREATE TABLE IF NOT EXISTS group_students (
  group_id   CHAR(36) NOT NULL,
  profile_id CHAR(36) NOT NULL,
  joined_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (group_id, profile_id),
  KEY idx_gs_profile (profile_id),
  CONSTRAINT fk_gs_group   FOREIGN KEY (group_id)   REFERENCES study_groups(id)     ON DELETE CASCADE,
  CONSTRAINT fk_gs_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vérification du téléphone par code à usage unique (D3, phase 1 : le code est transmis par WhatsApp par l'équipe).
CREATE TABLE IF NOT EXISTS phone_verifications (
  profile_id CHAR(36)    NOT NULL PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL,
  code_hash  CHAR(64)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,                               -- 15 minutes
  attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,                -- 5 essais au plus
  CONSTRAINT fk_pv_profile FOREIGN KEY (profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
