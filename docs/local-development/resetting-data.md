# Resetting Local Data

Starts everything over from nothing: the three databases, the stored project files, and the live-preview runners.

> **This is destructive and can't be undone.** It deletes every local project, chat, usage record, subscription and stored file. Firebase accounts and Stripe test data live in those services and are untouched; signing in again creates a fresh account row.

1. **Stop the Gateway and the three domain services.** Nothing else may be connected to Postgres.

2. **Recreate Postgres and MinIO from empty volumes** (from the repository root):

   ```bash
   docker compose -f services.docker-compose.yml down -v --remove-orphans
   docker compose -f services.docker-compose.yml up -d
   ```

   `down -v` removes the data volumes; `--remove-orphans` also removes containers left over from older versions of the compose file. On start-up, `infra/postgres-init/` creates the three empty databases.

3. **Release claimed runner pods** (skip this if you don't run previews). The pool replaces them with fresh idle pods, and preview routes in Redis expire on their own within `preview.route-ttl` (90 seconds):

   ```bash
   kubectl -n vibecraft-ai delete pod -l status=busy
   ```

4. **Start the stack again.** Flyway creates each schema, account-service seeds the plans, and workspace-service recreates its buckets and uploads the starter template. Then sign in through the frontend.

## Notes

- The databases must be *recreated*, not just emptied: Flyway checksums every applied migration, so a database built from an older version of a migration refuses to start.
- Existing browser sessions stop working after a reset, because the signed-in user no longer has an account row. The frontend signs you out; sign in again.
