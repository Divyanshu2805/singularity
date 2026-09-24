# Deploys and Rollback

## How a change reaches production

Every change goes through a pull request into `main`; `main` is never pushed to directly. Merging runs `.github/workflows/ci.yml`:

1. **Tests** — the backend reactor, the frontend (type-check, lint, tests, build) and the preview proxy.
2. **Images** — eight arm64 images built on GitHub's Arm runners, pushed to GHCR, tagged with the commit SHA.
3. **Approval** — the run pauses at "Approve the production deploy". Open the run, choose **Review deployments**, tick `release` and approve. Nothing is deployed until then. See [the release gate](../deployment/ci-cd.md#the-release-gate).
4. **Deploy** — one at a time (a second push queues; it never cancels a deploy in progress). The job joins the tailnet, rebuilds every Secret, applies the `oracle` overlay with the new tag, and waits for each workload in dependency order.
5. **Smoke test** — the app answers `200`, `/api/plans` returns the plan catalogue, and a preview hostname reaches the proxy.
6. **Rollback** — any failure after the apply runs `kubectl rollout undo` on every workload the deploy changed.

A pull request runs only the tests. Full details: [CI/CD pipeline](../deployment/ci-cd.md).

## Redeploying or rolling back a version

**Actions → CI → Run workflow**, with a commit SHA. The build jobs are skipped; after the approval, the run deploys the images already pushed for that SHA.

To roll back a single workload by hand:

```bash
kubectl --context <prod> -n vibecraft rollout undo deploy/<name>
```

**Migrations only go forward.** Flyway runs when each service starts, so rolling code back past a migration works only if the migration was backward-compatible. Keep migrations additive.

## When a deploy fails

Find the failed step in the run, then:

| Failed step | Likely cause | Fix |
|---|---|---|
| Smoke test, right after a cold start | The gateway hadn't discovered a just-started service through Eureka yet (up to about 30 seconds) | Check `https://<app domain>/api/plans` by hand; if it answers, **Re-run failed jobs** |
| Apply, with `field is immutable` on a Job | A Job's pod template can't change after creation, and this deploy changes its image | Delete the completed Job (`kubectl -n vibecraft delete job <name>`), then re-run; the apply creates it again. `minio-bootstrap-preview-reader` is safe to re-run |
| Wait, stuck on the first workload, with `exceeded quota` in `kubectl -n vibecraft get events` | Leftover pods from an earlier broken deploy hold the namespace's CPU limit, so a pod that everything else needs (usually `postgres-0`) can't be created | Scale the app Deployments to 0 (below), then re-run. The manifests set `replicas: 1`, so the deploy brings each one back |

```bash
kubectl --context <prod> -n vibecraft scale deploy discovery-service gateway-service account-service workspace-service intelligence-service frontend --replicas=0
```

A failed deploy's rollback points each workload at its previous version. If that version is itself broken, the new pods may keep serving while the old ones crash-loop; don't mistake that for a stable state, and redeploy.

## Starting from empty storage

To throw away all data and start fresh (a demo reset, not a recovery; to recover, see [backups](backups.md)): delete the `postgres` and `minio` StatefulSets, their `data-postgres-0` and `data-minio-0` claims, and the `minio-bootstrap-preview-reader` Job, then deploy. Postgres creates its user and the three databases from the current Secrets, each service runs its migrations on first start, and the Job recreates the preview reader. Keep the namespaces: deleting them also deletes the `deployer` token CI uses.

## Secrets

Every Kubernetes Secret is rebuilt from the GitHub `production` environment on each deploy by `deploy/scripts/apply-secrets.sh`, so no one edits a Secret on the server. To add one, see [adding a secret](../deployment/configuration.md#adding-a-secret).

### Rotating the Postgres or MinIO password

Changing `DB_PASSWORD` or `MINIO_ROOT_PASSWORD` in GitHub does **not** change the running server. Both read their initial password once, when their volume is first created, and keep it. After such a change, the next deploy writes a Secret that no longer matches: running pods keep working on open connections, and the first pod to restart fails to log in.

To rotate safely:

1. Change the password on the server first — `ALTER USER vibecraft WITH PASSWORD '...'` inside `postgres-0`, or restart MinIO with the new root password.
2. Then update the GitHub secret and deploy.

`apply-secrets.sh` acts on the current `kubectl` context and rewrites every Secret, so never run it by hand without the kubeconfig you mean.
