-- 0.22.0 : appareils de l'app native (Android) abonnés aux alertes app fermée (Firebase Cloud Messaging).
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     CHAR(36)    NOT NULL,
  token_hash  CHAR(64)    NOT NULL,                               -- SHA-256 du jeton (le jeton est long)
  token       TEXT        NOT NULL,
  platform    VARCHAR(10) NOT NULL DEFAULT 'android',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_fcm_token (token_hash),
  KEY idx_fcm_user (user_id),
  CONSTRAINT fk_fcm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
