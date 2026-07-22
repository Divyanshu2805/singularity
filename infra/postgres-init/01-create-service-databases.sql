-- Runs once, only on a brand-new `pgvector` container (the official Postgres image only executes
-- /docker-entrypoint-initdb.d/* the first time it initializes an empty data directory). Creates each service's
-- own database, so a fresh `docker compose up` needs no manual CREATE DATABASE. Flyway then creates each
-- schema on the service's first start. See docs/local-development/.
SELECT 'CREATE DATABASE "vibecraft-account-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibecraft-account-db')
\gexec

SELECT 'CREATE DATABASE "vibecraft-workspace-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibecraft-workspace-db')
\gexec

SELECT 'CREATE DATABASE "vibecraft-intelligence-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibecraft-intelligence-db')
\gexec
