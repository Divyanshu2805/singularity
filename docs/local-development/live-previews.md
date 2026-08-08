# Running Live Previews Locally

Live previews need a real Kubernetes cluster — they're not simulated. Without one, every other feature works normally; only starting/viewing a preview fails.

1. Stand up a local cluster (`kind` — this project's manifests assume the namespace `vibecraft-ai`).
2. Apply `k8s/infra.yml` first — it creates the `vibecraft-ai` namespace the next steps need, plus Redis.
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

The runner pods run as the non-root `node` user with every Linux capability dropped, no mounted service-account token, and a `NetworkPolicy` that only lets `vibecraft-proxy` reach their dev-server port — verified against a real `kind` cluster (CODE_REVIEW.md SEC-08/09/10): `npm install`, the writable `/app` and npm-cache volumes, and the proxy's connection to the dev server all still work; a non-proxy pod reaching the runner and the runner reaching Redis or the Kubernetes API are both blocked.

Every preview URL also carries a short-lived, signed access token (SEC-06) - a bare hostname is otherwise a permanent, unauthenticated link, so the proxy 401s any request without a valid token or the cookie it's exchanged for on first load. Also verified against the real cluster with a real browser: the token-to-cookie exchange, the redirected/cleaned-up URL, cookie-only reauthentication on reload, and a 401 for a hostname nobody has a token for.

Cold-start expectation: the *first* preview against a project can take up to `preview.boot-timeout` (2 minutes — `npm install` dominates), since it's a real `npm install && vite dev` inside the pod. A warm-pool pod is already running before that, so the wait is install time, not scheduling time.

Tail a runner pod's own output directly if something's stuck:

```bash
kubectl -n vibecraft-ai logs -l app=runner -c runner --tail=100 -f
kubectl -n vibecraft-ai logs -l app=runner -c syncer --tail=100 -f
```

(Or use `GET /api/projects/{id}/preview/logs`, which reads the same thing through the app.)
