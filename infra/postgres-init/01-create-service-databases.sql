-- Runs once, only on a brand-new `pgvector` container (the official Postgres image only executes
-- /docker-entrypoint-initdb.d/* the first time it initializes an empty data directory). Creates each service's
-- own database, so a fresh `docker compose up` needs no manual CREATE DATABASE. Flyway then creates each
-- schema on the service's first start. See docs/local-development/.
SELECT 'CREATE DATABASE "singularity-account-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'singularity-account-db')
\gexec

SELECT 'CREATE DATABASE "singularity-workspace-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'singularity-workspace-db')
\gexec

SELECT 'CREATE DATABASE "singularity-intelligence-db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'singularity-intelligence-db')
\gexec
