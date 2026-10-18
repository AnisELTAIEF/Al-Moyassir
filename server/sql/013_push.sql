-- 0.21.0 : abonnements aux alertes quand l'app est fermée (Web Push pour la version web / PWA).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       CHAR(36)    NOT NULL,
  endpoint_hash CHAR(64)    NOT NULL,                             -- SHA-256 de l'adresse (l'adresse est longue)
  endpoint      TEXT        NOT NULL,
  p256dh        VARCHAR(200) NOT NULL,
  auth          VARCHAR(100) NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
