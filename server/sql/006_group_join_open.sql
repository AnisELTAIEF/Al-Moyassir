-- 0.13.0 : interrupteur par groupe « autoriser l'adhésion avec le code » (demande de jointure via code).
-- Activé par défaut (adhésion acceptée). Quand il est désactivé, le code du groupe ne permet plus de le rejoindre.
ALTER TABLE study_groups
  ADD COLUMN join_open TINYINT(1) NOT NULL DEFAULT 1 AFTER join_code;
