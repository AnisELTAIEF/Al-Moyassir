-- Numéro de téléphone du parent (ou tuteur) sur la fiche de l'élève, au format international.
ALTER TABLE student_profiles ADD COLUMN guardian_phone VARCHAR(20) NULL AFTER phone_verified_at;
