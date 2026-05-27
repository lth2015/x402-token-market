-- Bootstrap script: runs once when the MySQL container is first created.
-- Creates the 3 logical databases + per-module users with least privilege.

CREATE DATABASE IF NOT EXISTS x402_qa  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS token_qa CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS wea_qa   CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- App users (dev passwords; QA uses Secrets Manager-rotated values).
CREATE USER IF NOT EXISTS 'x402_app'@'%'  IDENTIFIED BY 'x402_app_dev';
CREATE USER IF NOT EXISTS 'token_app'@'%' IDENTIFIED BY 'token_app_dev';
CREATE USER IF NOT EXISTS 'wea_app'@'%'   IDENTIFIED BY 'wea_app_dev';

GRANT ALL PRIVILEGES ON x402_qa.*  TO 'x402_app'@'%';
GRANT ALL PRIVILEGES ON token_qa.* TO 'token_app'@'%';
GRANT ALL PRIVILEGES ON wea_qa.*   TO 'wea_app'@'%';

-- Note: in QA we REVOKE UPDATE/DELETE on audit_log / ledger from app users.
-- For local dev we keep ALL so migrations and tests run unobstructed.

FLUSH PRIVILEGES;
