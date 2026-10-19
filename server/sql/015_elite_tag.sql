-- Étiquette manuelle « ضمن النخبة » (parmi l'élite) posée par l'équipe sur la fiche d'un élève.
-- Elle s'ajoute à l'élite calculée automatiquement dans le suivi (haut du classement).
ALTER TABLE student_profiles ADD COLUMN elite_tag TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
