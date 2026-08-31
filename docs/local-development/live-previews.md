# Running Live Previews Locally

Live previews need a real Kubernetes cluster — they're not simulated. Without one, every other feature works normally; only starting/viewing a preview fails.

**This section is the day-to-day dev loop**: the backend runs outside the cluster (`mvnw spring-boot:run`), and only the preview pipeline (Redis, the proxy, the runner pool) lives in kind, against the manifests in the repo-root `k8s/`. There is a *second*, separate kind exercise - `deploy/k8s/overlays/kind/` - that runs the entire application (Postgres, MinIO, all five Java services, the frontend) in-cluster, rehearsing the production topology docs/deployment/phase-3-kubernetes.md Phase 3 describes. Don't run both against the same cluster; see `deploy/k8s/overlays/kind/README.md` if that's what you're after instead.

1. Stand up a local cluster with `kind create cluster --name vibecraft --config k8s/kind-config.yaml` (this project's manifests assume the namespace `vibecraft-ai`). The config sets a kubelet-level `podPidsLimit: 1024` (CODE_REVIEW.md SEC-10) so a fork bomb inside a runner pod can't exhaust the node's process table - this only takes effect at node bootstrap, so a cluster created without it needs to be deleted and recreated with this config, not patched in place.
2. Apply `k8s/infra.yml` first — it creates the `vibecraft-ai` namespace the next steps need, plus Redis, a namespace-wide `LimitRange` (defaults/caps any container that doesn't set its own resources) and `ResourceQuota` (CODE_REVIEW.md SEC-10). Tune the quota's numbers for your cluster's real capacity - the checked-in ones are a starting point, not a load-tested ceiling. Then apply `k8s/minio-hostbridge.yml` — MinIO itself isn't in `infra.yml` any more (docs/deployment/phase-1-repo-readiness.md Phase 1): this bridges the cluster to `services.docker-compose.yml`'s MinIO on your own laptop, the way local dev has always worked. **Never also apply `k8s/minio.yml`** (a real in-cluster MinIO, for an actual deployment) — both define a Service named `minio-service`, and applying the second overwrites whichever the first created.
3. Create two secrets once per cluster — both are `Secret` references now, not literals in the manifests:
   ```bash
   # The runner pods' MinIO credential (CODE_REVIEW.md SEC-09):
   kubectl create secret generic minio-runner-credentials -n vibecraft-ai \
     --from-literal=host-uri='http://minioadmin:minioadmin123@minio-service:9000'

   # The proxy's preview-access-token secret (SEC-06) - must be byte-for-byte the same value as the
   # backend's PREVIEW_ACCESS_TOKEN_SECRET (.env), or every preview link 401s:
   kubectl create secret generic preview-access-token -n vibecraft-ai \
     --from-literal=secret='<same value as PREVIEW_ACCESS_TOKEN_SECRET in .env>'
   ```
4. Apply `k8s/runner-pods.yml` (the warm runner pool, its `ServiceAccount` and `NetworkPolicy`) and `k8s/vibecraft-proxy.yml` (the reverse proxy). If you rebuild the proxy image locally (`docker build -t vibecraft-proxy:latest proxy/`), `kind load docker-image vibecraft-proxy:latest --name <cluster-name>` first - `kind` doesn't see your local Docker daemon's images otherwise.
5. Make Redis and the proxy reachable from the backend process. `kind` has no load balancer or host-port mapping, so pick one:
   - Run the standalone scripts: `k8s/dev-port-forward.sh` (macOS/Linux/Git Bash) or `.ps1` (Windows) — forwards the proxy (`:8090`) and Redis (`:6379`) out of the cluster, auto-reconnecting if either drops.
   - Or set `preview.port-forward.enabled: true` in `application.yaml` and let the backend do the same thing itself (`config.PreviewPortForwarder`) — the two solve the same problem in different ways; don't run both at once against the same ports.
6. Start the backend normally. `PreviewRunnerPool`/`PreviewBootstrapper` reach the cluster via the fabric8 Kubernetes client, which reads your local `kubectl` context by default.

The runner pods run as the non-root `node` user with every Linux capability dropped, no mounted service-account token, and a `NetworkPolicy` that only lets `vibecraft-proxy` reach their dev-server port — verified against a real `kind` cluster (CODE_REVIEW.md SEC-08/09/10): `npm install`, the writable `/app` and npm-cache volumes, and the proxy's connection to the dev server all still work; a non-proxy pod reaching the runner and the runner reaching Redis or the Kubernetes API are both blocked. **The syncer container needs `HOME` set too** (`env: HOME: /tmp` in `runner-pods.yml`) — `quay.io/minio/mc` has no home directory baked in for uid 1000 the way `node:20-alpine`'s `node` user does, so every `mc` command failed outright (`mkdir /.mc: permission denied`) once `runAsUser: 1000` applied to it. This broke every single preview start and was only caught re-testing the actual sync path live (CODE_REVIEW.md PRE-01/PRE-06), not by SEC-08's own verification, which exercised the runner container's `npm install` but never the syncer container's `mc mirror`. See CLAUDE.md's gotchas table.

Every preview URL also carries a short-lived, signed access token (SEC-06) - a bare hostname is otherwise a permanent, unauthenticated link, so the proxy 401s any request without a valid token or the cookie it's exchanged for on first load. Also verified against the real cluster with a real browser: the token-to-cookie exchange, the redirected/cleaned-up URL, cookie-only reauthentication on reload, and a 401 for a hostname nobody has a token for.

Cold-start expectation: the *first* preview against a project can take up to `preview.boot-timeout` (2 minutes — `npm install` dominates), since it's a real `npm install && vite dev` inside the pod. A warm-pool pod is already running before that, so the wait is install time, not scheduling time.

Tail a runner pod's own output directly if something's stuck:

```bash
kubectl -n vibecraft-ai logs -l app=runner -c runner --tail=100 -f
kubectl -n vibecraft-ai logs -l app=runner -c syncer --tail=100 -f
```

(Or use `GET /api/projects/{id}/preview/logs`, which reads the same thing through the app.)
