-- Corbeille à deux niveaux : un objet supprimé (classe, groupe, enseignant retiré, invitation, examen, cadeau…)
-- reste 30 jours au niveau 1 (restaurable par l'administratif de l'établissement), puis 30 jours au niveau 2
-- (restaurable par l'admin global seulement), puis il est supprimé définitivement (60 jours au total).
CREATE TABLE IF NOT EXISTS trash (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  kind            VARCHAR(30)  NOT NULL,
  organization_id CHAR(36)     NULL,
  label           VARCHAR(200) NOT NULL,
  payload         LONGTEXT     NOT NULL,
  deleted_by      CHAR(36)     NULL,
  deleted_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_trash_org (organization_id, deleted_at),
  KEY idx_trash_time (deleted_at),
  CONSTRAINT fk_trash_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_trash_by  FOREIGN KEY (deleted_by)      REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
