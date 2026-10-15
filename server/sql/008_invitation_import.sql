-- 0.17.0 : import de listes d'utilisateurs.
-- display_name : nom complet indiqué par l'admin (pré-rempli à l'inscription, utilisé dans l'e-mail).
-- emailed_at   : date d'envoi réussi de l'e-mail d'invitation (envoi automatique SMTP).
ALTER TABLE invitations
  ADD COLUMN display_name VARCHAR(80) NULL,
  ADD COLUMN emailed_at   DATETIME(3) NULL;
