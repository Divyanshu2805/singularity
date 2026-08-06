# Running Live Previews Locally

Live previews need a real Kubernetes cluster — they're not simulated. Without one, every other feature works normally; only starting/viewing a preview fails.

1. Stand up a local cluster (`kind` — this project's manifests assume the namespace `vibecraft-ai`).
2. Apply `k8s/infra.yml` first — it creates the `vibecraft-ai` namespace the next steps need, plus Redis.
3. Create the runner pods' MinIO credential once per cluster — it's a `Secret` reference now, not a literal in the manifest (CODE_REVIEW.md SEC-09):
   ```bash
   kubectl create secret generic minio-runner-credentials -n vibecraft-ai \
     --from-literal=host-uri='http://minioadmin:minioadmin123@minio-service:9000'
   ```
4. Apply `k8s/runner-pods.yml` (the warm runner pool, its `ServiceAccount` and `NetworkPolicy`) and `k8s/vibecraft-proxy.yml` (the reverse proxy).
5. Make Redis and the proxy reachable from the backend process. `kind` has no load balancer or host-port mapping, so pick one:
   - Run the standalone scripts: `k8s/dev-port-forward.sh` (macOS/Linux/Git Bash) or `.ps1` (Windows) — forwards the proxy (`:8090`) and Redis (`:6379`) out of the cluster, auto-reconnecting if either drops.
   - Or set `preview.port-forward.enabled: true` in `application.yaml` and let the backend do the same thing itself (`config.PreviewPortForwarder`) — the two solve the same problem in different ways; don't run both at once against the same ports.
6. Start the backend normally. `PreviewRunnerPool`/`PreviewBootstrapper` reach the cluster via the fabric8 Kubernetes client, which reads your local `kubectl` context by default.

The runner pods run as the non-root `node` user with every Linux capability dropped, no mounted service-account token, and a `NetworkPolicy` that only lets `vibecraft-proxy` reach their dev-server port — verified against a real `kind` cluster (CODE_REVIEW.md SEC-08/09/10): `npm install`, the writable `/app` and npm-cache volumes, and the proxy's connection to the dev server all still work; a non-proxy pod reaching the runner and the runner reaching Redis or the Kubernetes API are both blocked.

Cold-start expectation: the *first* preview against a project can take up to `preview.boot-timeout` (2 minutes — `npm install` dominates), since it's a real `npm install && vite dev` inside the pod. A warm-pool pod is already running before that, so the wait is install time, not scheduling time.

Tail a runner pod's own output directly if something's stuck:

```bash
kubectl -n vibecraft-ai logs -l app=runner -c runner --tail=100 -f
kubectl -n vibecraft-ai logs -l app=runner -c syncer --tail=100 -f
```

(Or use `GET /api/projects/{id}/preview/logs`, which reads the same thing through the app.)
