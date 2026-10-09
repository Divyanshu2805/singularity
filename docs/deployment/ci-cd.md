# CI/CD Pipeline

Everything is one workflow, `.github/workflows/ci.yml`.

## Jobs

| Job | Runs on | Does |
|---|---|---|
| `backend` | push, pull request | Builds and tests the Maven reactor with `verify`, which also holds each module to its coverage floor; writes coverage per module to the job summary; uploads the tested jars for the image build |
| `frontend` | push, pull request | Type-check, lint, production build, and the tests with coverage held to its floors |
| `proxy` | push, pull request | The preview proxy's `node --test` suite |
| `preview-pipeline` | push, pull request | Creates a kind cluster, stands the preview pipeline up in its own namespace (`k8s/preview-test-cluster.sh`) and runs `PreviewPipelineIT`: a real preview started, fetched through the proxy, edited, given a new package, killed, queued for and stopped. Its start timings go to the job summary |
| `journey` | push, pull request | Packages the services, creates a kind cluster, starts the whole application on the runner (`e2e/stack.sh`) and walks one person's path through it in a real browser, with the scripted model and the Firebase Auth emulator. Needs no secret. **Does not gate the deploy yet** - add it to `approve` after a few green runs |
| `lighthouse` | push, pull request | Builds the frontend, serves it from the nginx image a deploy uses, and audits the landing and sign-in pages; fails under the accessibility, best-practices or SEO floor |
| `build-java-images` | push, after `backend` | Five images from the tested jars (a matrix over the services) |
| `build-frontend-image` | push, after `frontend` | The frontend image, with the public `VITE_*` values as build arguments |
| `build-proxy-image` | push, after `proxy` | The preview-proxy image |
| `build-preview-runner-image` | push | The preview-runner image (starter-template `node_modules`); no test gate |
| `approve` | push, manual; after all four image jobs and `preview-pipeline` | The release gate: waits for the owner to approve in the Actions UI |
| `deploy` | push, manual; after `approve` | Deploys, smoke-tests and, on failure, rolls back |

Each test job gates only its own image, so a frontend failure never blocks the Java images from building — but the approval, and so the deploy, waits for all four image jobs and for `preview-pipeline`, which gates no image of its own and would otherwise not hold a deploy back. On a push it runs only if all five succeeded; on a manual run only if all five were skipped, as they are by design there. A failed test also leaves its image job skipped, so accepting "skipped" on a push would deploy image tags that were never built.

A pull request runs only the three test jobs; it never sees a secret and never deploys.

## The release gate

Nothing reaches production without an explicit approval. The `approve` job uses the `release` environment, whose protection rule lists the owner as a required reviewer, so a merged change builds its images and then pauses with "Review deployments" in the run. Approving starts the deploy; rejecting, or leaving it for 30 days, ends the run with nothing deployed. Manual redeploys pass through the same gate.

The gate is a separate environment on purpose. `production` holds the secrets and is also used by the frontend image build and the daily backup-freshness check; a reviewer rule there would make both of those wait for a person too. `release` holds nothing.

## Deploy

1. **One at a time.** The `deploy` job uses the `production-deploy` concurrency group without cancellation, so a second push queues rather than interrupting a deploy in progress.
2. **Check the commit, then connect.** The commit to deploy must be a full SHA and an ancestor of `main` - a manual redeploy takes it as typed text. The job then joins the tailnet briefly with an ephemeral node and builds a kubeconfig from the namespace-scoped `deployer` token, checking the API server's certificate when `KUBE_CA_CERT` is set, and retries `kubectl get --raw=/livez` until the API answers.
3. **Secrets.** `deploy/scripts/apply-secrets.sh` rebuilds every Kubernetes Secret from the `production` environment. A missing required value fails the deploy before anything is applied.
4. **Apply.** The revision each workload is running is written down (`deploy/scripts/deploy-revisions.sh record`), the commit SHA is set as the image tag in the `oracle` overlay, and `kubectl apply -k` runs.
5. **Wait.** Each workload's rollout is awaited in dependency order, up to five minutes each.
6. **Smoke test.** `deploy/scripts/smoke-test.sh` checks that the app answers `200`, `/api/plans` returns JSON, and a random preview hostname reaches the proxy's "not running" page.
7. **Roll back** on any failure after the apply: each workload now at a different revision from the one written down is put back to it (`deploy-revisions.sh rollback`), the runner pool included. A workload the deploy did not change is not touched, and a failure before the apply rolls nothing back.

The workflow's token is read-only; only the four image builds ask for `packages: write`.

The smoke test runs as soon as the last rollout finishes, and the gateway finds services through Eureka, which can take up to about 30 seconds to register one. After a cold start, when every service has just started, `/api/plans` can fail for that window alone. Recovering from a failed deploy: [deploys](../operations/deploys.md#when-a-deploy-fails).

## Manual redeploy

**Actions → CI → Run workflow**, optionally with a commit SHA, redeploys that version using the images already pushed for it, after the same approval. A manual run skips the test and build jobs.

## Database migrations

Flyway runs when each service starts, and migrations only go forward. Rolling code back after a migration works only if the migration is backward-compatible, so keep migrations additive.

## Supply-chain checks

- **Actions are pinned by commit SHA**, with the tag it pointed to as a trailing comment (`uses: actions/checkout@<sha> # v4`), so a moved or hijacked tag cannot change what a workflow runs. A new action is added the same way: resolve the tag with `git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<tag>^{}'`.
- **Updates are made by hand.** Nothing opens update pull requests: dependency versions, base images and the pinned actions are raised deliberately, and a pinned action goes stale until someone re-resolves its tag.
- **CodeQL** (`.github/workflows/codeql.yml`) analyses the Java services and the TypeScript on every pull request and push to `main`, and weekly. Java runs without a build, so it needs no Maven cache. Findings are under the Security tab.
- **Pinned security versions.** The root `pom.xml` overrides several versions Spring Boot's BOM manages (Tomcat, Netty, Jackson, the PostgreSQL driver, FreeMarker, the Apache HTTP components, Log4j) and pins Bouncy Castle and Apache HttpClient 4, because a scan of the runtime classpath found advisories in the BOM's versions. Drop an override once the Boot version in use includes it.
