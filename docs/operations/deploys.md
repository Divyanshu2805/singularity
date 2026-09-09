# Deploys and Rollback

## How a change reaches production

A push to `main` runs `.github/workflows/ci.yml`:

1. **Tests** — the backend reactor, the frontend (type-check, lint, tests, build) and the preview proxy.
2. **Images** — eight arm64 images built on GitHub's Arm runners, pushed to GHCR, tagged with the commit SHA.
3. **Deploy** — one at a time (a second push queues; it never cancels a deploy in progress). The job joins the tailnet, rebuilds every Secret, applies the `oracle` overlay with the new tag, and waits for each workload in dependency order.
4. **Smoke test** — the app answers `200`, `/api/plans` returns the plan catalogue, and a preview hostname reaches the proxy.
5. **Rollback** — any failure after the apply runs `kubectl rollout undo` on every workload the deploy changed.

A pull request runs only the tests. Full details: [CI/CD pipeline](../deployment/ci-cd.md).

> The `push` and `pull_request` triggers are currently disabled; see [CI/CD](../deployment/ci-cd.md) for how to re-enable them.

## Redeploying or rolling back a version

**Actions → CI → Run workflow**, with a commit SHA. The build jobs are skipped; the run deploys the images already pushed for that SHA.

To roll back a single workload by hand:

```bash
kubectl --context <prod> -n vibecraft rollout undo deploy/<name>
```

**Migrations only go forward.** Flyway runs when each service starts, so rolling code back past a migration works only if the migration was backward-compatible. Keep migrations additive.

## Secrets

Every Kubernetes Secret is rebuilt from the GitHub `production` environment on each deploy by `deploy/scripts/apply-secrets.sh`, so no one edits a Secret on the server. To add one, see [adding a secret](../deployment/configuration.md#adding-a-secret).

### Rotating the Postgres or MinIO password

Changing `DB_PASSWORD` or `MINIO_ROOT_PASSWORD` in GitHub does **not** change the running server. Both read their initial password once, when their volume is first created, and keep it. After such a change, the next deploy writes a Secret that no longer matches: running pods keep working on open connections, and the first pod to restart fails to log in.

To rotate safely:

1. Change the password on the server first — `ALTER USER vibecraft WITH PASSWORD '...'` inside `postgres-0`, or restart MinIO with the new root password.
2. Then update the GitHub secret and deploy.

`apply-secrets.sh` acts on the current `kubectl` context and rewrites every Secret, so never run it by hand without the kubeconfig you mean.
