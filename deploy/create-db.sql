-- À exécuter en root MariaDB : sudo mariadb < create-db.sql (après avoir remplacé MOT_DE_PASSE).
-- Base et utilisateur DÉDIÉS : ne touche à aucune base existante (site Best CIT inclus).
CREATE DATABASE IF NOT EXISTS hifidh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'hifidh'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON hifidh.* TO 'hifidh'@'localhost';
FLUSH PRIVILEGES;
