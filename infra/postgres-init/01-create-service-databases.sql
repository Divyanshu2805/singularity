-- Runs once, only on a brand-new `pgvector` container (the official Postgres image only executes
-- /docker-entrypoint-initdb.d/* the first time it initializes an empty data directory). POSTGRES_DB in
-- services.docker-compose.yml creates vibecraft-db itself; every other per-service database, as they're
-- added through the microservices migration, gets created here so a fresh `docker compose up` matches an
-- existing dev environment without a manual CREATE DATABASE. See docs/local-development/.
SELECT 'CREATE DATABASE "vibecraft-account-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibecraft-account-db')
\gexec

SELECT 'CREATE DATABASE "vibecraft-workspace-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibecraft-workspace-db')
\gexec

SELECT 'CREATE DATABASE "vibecraft-intelligence-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibecraft-intelligence-db')
\gexec
