# CI/CD Pipeline

Everything is one workflow, `.github/workflows/ci.yml`.

![CI/CD pipeline](../assets/diagrams/ci-cd-pipeline.png)

## Jobs

| Job | Runs on | Does |
|---|---|---|
| `backend` | push, pull request | Builds and tests the Maven reactor; uploads the tested jars for the image build |
| `frontend` | push, pull request | Type-check, lint, tests and production build |
| `proxy` | push, pull request | The preview proxy's `node --test` suite |
| `build-java-images` | push, after `backend` | Five images from the tested jars (a matrix over the services) |
| `build-frontend-image` | push, after `frontend` | The frontend image, with the public `VITE_*` values as build arguments |
| `build-proxy-image` | push, after `proxy` | The preview-proxy image |
| `build-preview-runner-image` | push | The preview-runner image (starter-template `node_modules`); no test gate |
| `approve` | push, manual; after all four image jobs | The release gate: waits for the owner to approve in the Actions UI |
| `deploy` | push, manual; after `approve` | Deploys, smoke-tests and, on failure, rolls back |

Each test job gates only its own image, so a frontend failure never blocks the Java images from building — but the approval, and so the deploy, waits for all four image jobs. On a push it runs only if all four succeeded; on a manual run only if all four were skipped, as they are by design there. A failed test also leaves its image job skipped, so accepting "skipped" on a push would deploy image tags that were never built.

A pull request runs only the three test jobs; it never sees a secret and never deploys.

## The release gate

Nothing reaches production without an explicit approval. The `approve` job uses the `release` environment, whose protection rule lists the owner as a required reviewer, so a merged change builds its images and then pauses with "Review deployments" in the run. Approving starts the deploy; rejecting, or leaving it for 30 days, ends the run with nothing deployed. Manual redeploys pass through the same gate.

The gate is a separate environment on purpose. `production` holds the secrets and is also used by the frontend image build and the daily backup-freshness check; a reviewer rule there would make both of those wait for a person too. `release` holds nothing.

## Deploy

1. **One at a time.** The `deploy` job uses the `production-deploy` concurrency group without cancellation, so a second push queues rather than interrupting a deploy in progress.
2. **Connect.** The job joins the tailnet briefly with an ephemeral node, then builds a kubeconfig from the namespace-scoped `deployer` token, retrying `kubectl get --raw=/livez` until the API answers.
3. **Secrets.** `deploy/scripts/apply-secrets.sh` rebuilds every Kubernetes Secret from the `production` environment. A missing required value fails the deploy before anything is applied.
4. **Apply.** The commit SHA is set as the image tag in the `oracle` overlay, and `kubectl apply -k` runs.
5. **Wait.** Each workload's rollout is awaited in dependency order, up to five minutes each.
6. **Smoke test.** `deploy/scripts/smoke-test.sh` checks that the app answers `200`, `/api/plans` returns JSON, and a random preview hostname reaches the proxy's "not running" page.
7. **Roll back** on any failure after the apply: `kubectl rollout undo` on every workload the deploy changed, including the runner pool.

The smoke test runs as soon as the last rollout finishes, and the gateway finds services through Eureka, which can take up to about 30 seconds to register one. After a cold start, when every service has just started, `/api/plans` can fail for that window alone. Recovering from a failed deploy: [deploys](../operations/deploys.md#when-a-deploy-fails).

## Manual redeploy

**Actions → CI → Run workflow**, optionally with a commit SHA, redeploys that version using the images already pushed for it, after the same approval. A manual run skips the test and build jobs.

## Database migrations

Flyway runs when each service starts, and migrations only go forward. Rolling code back after a migration works only if the migration is backward-compatible, so keep migrations additive.
