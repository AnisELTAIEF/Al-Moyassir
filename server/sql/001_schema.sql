-- Fifidh al-Qur'an — schéma MariaDB (10.5+) / MySQL 8 compatible
-- Numérotation des versets : Qalun, mushaf Awqaf libyen (6214 ayat).

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  email         VARCHAR(254) NOT NULL,
  display_name  VARCHAR(80)  NOT NULL DEFAULT '',
  password_hash VARCHAR(100) NULL,
  google_sub    VARCHAR(64)  NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3)  NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS study_groups (
  id         CHAR(36)    NOT NULL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  created_by CHAR(36)    NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_groups_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_members (
  group_id  CHAR(36) NOT NULL,
  user_id   CHAR(36) NOT NULL,
  role      ENUM('manager','member') NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (group_id, user_id),
  KEY idx_group_members_user (user_id),
  CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_gm_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitations (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  email       VARCHAR(254) NOT NULL,
  code_hash   CHAR(64)     NOT NULL,
  role        ENUM('user','admin') NOT NULL DEFAULT 'user',
  group_id    CHAR(36)     NULL,
  invited_by  CHAR(36)     NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at  DATETIME(3)  NOT NULL,
  accepted_at DATETIME(3)  NULL,
  accepted_by CHAR(36)     NULL,
  revoked_at  DATETIME(3)  NULL,
  UNIQUE KEY uq_invitations_code (code_hash),
  KEY idx_invitations_email (email),
  CONSTRAINT fk_inv_group   FOREIGN KEY (group_id)    REFERENCES study_groups(id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_inviter FOREIGN KEY (invited_by)  REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_user    FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          CHAR(36)    NOT NULL PRIMARY KEY,
  user_id     CHAR(36)    NOT NULL,
  token_hash  CHAR(64)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at  DATETIME(3) NOT NULL,
  revoked_at  DATETIME(3) NULL,
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS surahs (
  n          TINYINT UNSIGNED  NOT NULL PRIMARY KEY,
  name       VARCHAR(40)       NOT NULL,
  ayah_count SMALLINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memorized_ayahs (
  user_id          CHAR(36)          NOT NULL,
  surah            TINYINT UNSIGNED  NOT NULL,
  ayah             SMALLINT UNSIGNED NOT NULL,
  status           ENUM('learning','memorized') NOT NULL,
  memorized_at     DATETIME(3) NULL,
  last_reviewed_at DATETIME(3) NULL,
  review_count     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at       DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, surah, ayah),
  KEY idx_memorized_updated (user_id, updated_at),
  CONSTRAINT chk_surah CHECK (surah BETWEEN 1 AND 114),
  CONSTRAINT chk_ayah  CHECK (ayah >= 1),
  CONSTRAINT fk_ma_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
