-- 0.20.0 : validation de la mémorisation par l'enseignant (lot C) et centre de notifications.
-- Additive. La validation de l'enseignant est la SEULE source des rapports (décision D2) ; elle est tenue
-- à part de l'auto-marquage de l'élève (memorized_ayahs), qui reste privé (D15).

-- Journal : chaque validation posée, jamais modifiée ni supprimée (sert aux rapports par période et au rythme).
CREATE TABLE IF NOT EXISTS validations (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id CHAR(36)    NOT NULL,
  profile_id      CHAR(36)    NOT NULL,
  teacher_id      CHAR(36)    NULL,
  surah           TINYINT UNSIGNED  NOT NULL,
  ayah            SMALLINT UNSIGNED NOT NULL,
  result          ENUM('acquired','acquired_error','review','cleared') NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_val_profile (profile_id, organization_id, created_at),
  KEY idx_val_org_time (organization_id, created_at),
  CONSTRAINT fk_val_org     FOREIGN KEY (organization_id) REFERENCES organizations(id)     ON DELETE CASCADE,
  CONSTRAINT fk_val_profile FOREIGN KEY (profile_id)      REFERENCES student_profiles(id)  ON DELETE CASCADE,
  CONSTRAINT fk_val_teacher FOREIGN KEY (teacher_id)      REFERENCES users(id)             ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dernier état par ayah (lecture rapide). Un ayah « effacé » n'y figure plus.
CREATE TABLE IF NOT EXISTS validation_state (
  organization_id CHAR(36)    NOT NULL,
  profile_id      CHAR(36)    NOT NULL,
  surah           TINYINT UNSIGNED  NOT NULL,
  ayah            SMALLINT UNSIGNED NOT NULL,
  result          ENUM('acquired','acquired_error','review') NOT NULL,
  teacher_id      CHAR(36)    NULL,
  updated_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (organization_id, profile_id, surah, ayah),
  KEY idx_vs_profile (profile_id),
  CONSTRAINT fk_vs_org     FOREIGN KEY (organization_id) REFERENCES organizations(id)    ON DELETE CASCADE,
  CONSTRAINT fk_vs_profile FOREIGN KEY (profile_id)      REFERENCES student_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_vs_teacher FOREIGN KEY (teacher_id)      REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Centre de notifications dans l'app. Le texte est composé côté app dans la langue de l'utilisateur à partir
-- de `kind` et `payload` (JSON) ; `title` et `body` ne sont qu'un repli en français.
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  kind       VARCHAR(30) NOT NULL,                              -- 'retake_pages' | 'review_ayat' | …
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(400) NOT NULL DEFAULT '',
  payload    TEXT        NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at    DATETIME(3) NULL,
  KEY idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
