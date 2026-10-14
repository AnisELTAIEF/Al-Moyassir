-- 0.13.0 : réinitialisation du mot de passe par l'admin.
-- L'admin génère un code (empreinte stockée) ; l'utilisateur le saisit dans l'app pour choisir un nouveau mot de passe.
ALTER TABLE users
  ADD COLUMN reset_code_hash  CHAR(64)    NULL,
  ADD COLUMN reset_expires_at DATETIME(3) NULL;
