-- 0.21.0 : résultats d'examens et de concours, certificats (fichiers), récompenses des élèves d'élite.
-- Additive. Les fichiers des certificats vivent hors base (CERT_DIR) ; la base ne garde que leur description.

CREATE TABLE IF NOT EXISTS assessments (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  organization_id CHAR(36)     NOT NULL,
  profile_id      CHAR(36)     NOT NULL,
  kind            ENUM('exam','competition') NOT NULL,
  title           VARCHAR(160) NOT NULL,
  held_on         DATE         NOT NULL,
  score           VARCHAR(40)  NULL,
  rank_text       VARCHAR(40)  NULL,
  created_by      CHAR(36)     NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_assess_profile (profile_id, held_on),
  CONSTRAINT fk_as_org     FOREIGN KEY (organization_id) REFERENCES organizations(id)    ON DELETE CASCADE,
  CONSTRAINT fk_as_profile FOREIGN KEY (profile_id)      REFERENCES student_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_as_creator FOREIGN KEY (created_by)      REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificates (
  id              CHAR(36)     NOT NULL PRIMARY KEY,              -- = nom du fichier sur disque
  organization_id CHAR(36)     NOT NULL,
  profile_id      CHAR(36)     NOT NULL,
  assessment_id   CHAR(36)     NULL,
  title           VARCHAR(160) NOT NULL,
  issued_on       DATE         NOT NULL,
  file_name       VARCHAR(160) NOT NULL,
  mime            VARCHAR(40)  NOT NULL,                          -- déterminé par le contenu du fichier, pas par le client
  size_bytes      INT UNSIGNED NOT NULL,
  uploaded_by     CHAR(36)     NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_cert_profile (profile_id, issued_on),
  CONSTRAINT fk_ce_org        FOREIGN KEY (organization_id) REFERENCES organizations(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ce_profile    FOREIGN KEY (profile_id)      REFERENCES student_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ce_assessment FOREIGN KEY (assessment_id)   REFERENCES assessments(id)      ON DELETE SET NULL,
  CONSTRAINT fk_ce_uploader   FOREIGN KEY (uploaded_by)     REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Encouragements (D18) : message ou cadeau ; le certificat passe par la table certificates.
CREATE TABLE IF NOT EXISTS rewards (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  organization_id CHAR(36)     NOT NULL,
  profile_id      CHAR(36)     NOT NULL,
  kind            ENUM('message','gift') NOT NULL,
  title           VARCHAR(160) NOT NULL,
  body            VARCHAR(400) NOT NULL DEFAULT '',
  gift_status     ENUM('to_give','given') NULL,                   -- seulement pour un cadeau
  given_on        DATE         NULL,
  created_by      CHAR(36)     NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rw_profile (profile_id, created_at),
  CONSTRAINT fk_rw_org     FOREIGN KEY (organization_id) REFERENCES organizations(id)    ON DELETE CASCADE,
  CONSTRAINT fk_rw_profile FOREIGN KEY (profile_id)      REFERENCES student_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rw_creator FOREIGN KEY (created_by)      REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
