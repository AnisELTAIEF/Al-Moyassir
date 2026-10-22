-- Invitations d'établissement : enseignant (ou administratif) invité directement, avec ou SANS adresse e-mail
-- (le code est alors à transmettre à la personne, qui s'inscrit avec l'e-mail de son choix).
ALTER TABLE invitations
  MODIFY COLUMN email VARCHAR(254) NULL,
  ADD COLUMN org_id    CHAR(36) NULL AFTER group_role,
  ADD COLUMN org_role  ENUM('admin','teacher') NULL AFTER org_id,
  ADD COLUMN class_id  CHAR(36) NULL AFTER org_role,
  ADD CONSTRAINT fk_inv_org   FOREIGN KEY (org_id)   REFERENCES organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_inv_class FOREIGN KEY (class_id) REFERENCES study_groups(id)  ON DELETE SET NULL;
