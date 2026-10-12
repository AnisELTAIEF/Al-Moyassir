-- 0.7.0 : marquage « à revoir » d'un ayah (colorisation par niveau de maîtrise).
-- Rétrocompatible : valeur par défaut 0 ; un ancien client qui n'envoie pas le champ ne le modifie pas.
ALTER TABLE memorized_ayahs
  ADD COLUMN needs_review TINYINT(1) NOT NULL DEFAULT 0 AFTER review_count;
