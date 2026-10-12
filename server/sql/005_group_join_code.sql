-- 0.10.0 : code permanent par groupe (6 caractères) pour le rejoindre sans invitation par e-mail.
-- Rétrocompatible : colonne facultative ; les codes des groupes existants sont créés au démarrage de l'API.
ALTER TABLE study_groups
  ADD COLUMN join_code CHAR(6) NULL AFTER name,
  ADD UNIQUE KEY uq_groups_join_code (join_code);
