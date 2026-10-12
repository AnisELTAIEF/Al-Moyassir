-- Chaque groupe a un ou plusieurs « admins de groupe » (anciennement « responsables »).
ALTER TABLE group_members MODIFY role ENUM('manager','member','admin') NOT NULL DEFAULT 'member';
UPDATE group_members SET role = 'admin' WHERE role = 'manager';
ALTER TABLE group_members MODIFY role ENUM('admin','member') NOT NULL DEFAULT 'member';

-- Une invitation peut faire entrer directement la personne comme admin du groupe.
ALTER TABLE invitations ADD COLUMN group_role ENUM('admin','member') NOT NULL DEFAULT 'member' AFTER group_id;
