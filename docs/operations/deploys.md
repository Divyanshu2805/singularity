# How a change reaches production

Everything is `.github/workflows/ci.yml`, on a push to `main`:

1. **Tests** - the backend reactor, the frontend (typecheck, lint, build, tests) and the preview proxy. A pull request runs only these, never sees a secret, never deploys.
2. **Images** - eight arm64 images (five Java services, frontend, preview proxy, preview runner) built on GitHub's Arm runners and pushed to GHCR, tagged with the commit SHA.
3. **Deploy** - one at a time (`production-deploy` concurrency group; a second push queues, it does not cancel). The job joins the tailnet, builds a kubeconfig from the namespace-scoped `deployer` token, runs `deploy/scripts/apply-secrets.sh`, swaps the SHA into the oracle overlay and runs `kubectl apply -k`, then waits for each workload in dependency order.
4. **Smoke test** - `deploy/scripts/smoke-test.sh`: the app answers 200, `/api/plans` returns the catalogue, and a preview hostname reaches the proxy.
5. **Rollback** - any failure after the apply runs `kubectl rollout undo` on every workload it changed, including the runner pool.

**Redeploy or roll back to any version:** Actions → CI → *Run workflow*, and give a commit SHA. The build jobs are skipped for a manual run; it reuses the images already pushed for that SHA.

**Database migrations only go forward.** Flyway runs at service start, so rolling the code back after a migration only works if the migration was backward-compatible. Keep migrations additive.

## Secrets

Every Kubernetes Secret is rebuilt from the GitHub `production` environment on every deploy by `deploy/scripts/apply-secrets.sh`, so nobody hand-edits a secret on the server. The environment's entries and what each holds are listed in `docs/deployment/` (Phase 0). To add one: create it in the GitHub environment, add it to the required-variable list and an `apply` call in `apply-secrets.sh`, pass it in the `deploy` job's `env:` in `ci.yml`, and reference it from the manifest that needs it. A missing required variable fails the deploy loudly, before anything is applied.

**Changing a secret's value does not change a database that already exists.** Postgres and MinIO read their initial password from the Secret exactly once, when their volume is first initialised, and keep it in the volume. Rewriting `DB_PASSWORD` or `MINIO_ROOT_PASSWORD` in GitHub makes the next deploy write a Secret that no longer matches the running server: the old service pods keep working on their open connections, and the first pod that restarts fails to log in. To rotate one, change the server's own password first (`ALTER USER vibecraft WITH PASSWORD '...'` inside `postgres-0`; restart MinIO with the new value) and then the Secret.
