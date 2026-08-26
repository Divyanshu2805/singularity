# Resetting Local Data

Starts everything over from nothing: the three service databases, the MinIO project files, and the live-preview runners. **This is destructive and cannot be undone** — it deletes every project, chat, usage record, subscription row and stored file in your local environment. Firebase accounts and Stripe test-mode data live in those services, not here, so they are untouched: signing in again simply creates a fresh account row (ids restart at 1).

1. **Stop the Gateway and the three services** (and nothing else may be connected to Postgres).
2. **Recreate Postgres and MinIO from empty volumes**, from the repo root:

   ```bash
   docker compose -f services.docker-compose.yml down -v --remove-orphans
   docker compose -f services.docker-compose.yml up -d
   ```

   `down -v` removes the two data volumes (`vibecraft_pgvector-data`, `vibecraft_minio-data`), and `--remove-orphans` also removes a leftover container from an older compose file that no longer defines it (an old `mailpit-vibecraft`). `up -d` recreates the containers: `infra/postgres-init/` creates the three empty service databases, and MinIO starts empty.
3. **Release the runner pods that were claimed by projects that no longer exist** (skip this if you don't run live previews). The pool's Deployment starts fresh idle replacements by itself; preview routes in Redis expire on their own within `preview.route-ttl` (90 s):

   ```bash
   kubectl -n vibecraft-ai delete pod -l status=busy
   ```
4. **Start the stack again** (discovery, the three services, the Gateway). Each service's Flyway creates its schema on first start, `PlanSeeder` seeds the Free/Pro/Business plans, and workspace-service creates the `projects`/`project-blobs`/`starter-projects` buckets and re-uploads the starter template's own 15 files into the last one (`StarterTemplateSeeder`, checked into the repo under `workspace-service/src/main/resources/starter-templates/` — this used to live only in one developer's long-lived local MinIO volume, so a reset like this one previously left every new project's template-init step failing with no files to copy). Then sign in through the frontend.

Two things to know. First, the reset has to *recreate* the databases, not just empty the tables: Flyway records a checksum for each applied migration, so a service started against an old database after its `V1__init.sql` was edited refuses to boot. Second, existing browser sessions stop working after a reset (the signed-in user has no account row any more) — the frontend signs you out and you sign in again.
