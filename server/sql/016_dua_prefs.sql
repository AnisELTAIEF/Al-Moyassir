-- 0.28.0 : invocation toutes les heures dans la barre de notifications (facultatif, désactivé par défaut).
-- On retient le décalage horaire de l'appareil pour n'envoyer que dans la journée (8 h – 21 h, heure locale).
CREATE TABLE IF NOT EXISTS dua_prefs (
  user_id         CHAR(36)    NOT NULL PRIMARY KEY,
  hourly          TINYINT(1)  NOT NULL DEFAULT 0,
  utc_offset_min  SMALLINT    NOT NULL DEFAULT 0,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_dp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
