# Live Previews

Live previews need a real Kubernetes cluster. Without one, every other feature works; only starting a preview fails.

In this setup the backend runs on your machine (`spring-boot:run`) and only the preview pipeline — Redis, the preview proxy, and the runner pods — runs in a local kind cluster, using the manifests in `k8s/`.

> This is different from the **full-stack rehearsal** in `deploy/k8s/overlays/kind/`, which runs the whole application in-cluster to rehearse the production topology. Don't apply both to the same cluster; see that directory's [README](../../deploy/k8s/overlays/kind/README.md).

## Set up the cluster

1. **Create the cluster** with the repository's config:

   ```bash
   kind create cluster --name vibecraft --config k8s/kind-config.yaml
   ```

   The config sets a kubelet PID limit (`podPidsLimit: 1024`) so a runaway process in a runner pod can't exhaust the node. It applies only when a node is created, so an existing cluster created without it must be recreated.

2. **Apply the base resources**, then the bridge to your local MinIO:

   ```bash
   kubectl apply -f k8s/infra.yml             # namespace vibecraft-ai, Redis, LimitRange, ResourceQuota
   kubectl apply -f k8s/minio-hostbridge.yml  # points the cluster at MinIO on your machine
   ```

   Don't also apply `k8s/minio.yml` (an in-cluster MinIO): both define a Service named `minio-service`, and the second overwrites the first.

3. **Create the two secrets:**

   ```bash
   # The runner pods' MinIO credential
   kubectl create secret generic minio-runner-credentials -n vibecraft-ai \
     --from-literal=host-uri='http://minioadmin:minioadmin123@minio-service:9000'

   # The proxy's token secret — must equal PREVIEW_ACCESS_TOKEN_SECRET in .env
   kubectl create secret generic preview-access-token -n vibecraft-ai \
     --from-literal=secret='<same value as PREVIEW_ACCESS_TOKEN_SECRET>'
   ```

4. **Apply the runner pool and the proxy:**

   ```bash
   kubectl apply -f k8s/runner-pods.yml
   kubectl apply -f k8s/vibecraft-proxy.yml
   ```

   If you rebuild the proxy image locally, load it into kind first: `kind load docker-image vibecraft-proxy:latest --name vibecraft`.

5. **Expose Redis and the proxy to the backend.** kind has no load balancer, so forward the ports. Either run the helper script in its own terminal (it reconnects automatically):

   ```bash
   k8s/dev-port-forward.sh     # macOS, Linux, Git Bash
   k8s/dev-port-forward.ps1    # Windows PowerShell
   ```

   or set `preview.port-forward.enabled: true` in workspace-service's `application.yaml` to have the service forward them itself. Use one or the other, not both.

6. **Start the backend** as usual. workspace-service reaches the cluster through your current `kubectl` context.

## What to expect

- The first start of a preview is dominated by `npm install` and can take up to `preview.boot-timeout`. A warm-pool pod is already scheduled, so the wait is install time, not scheduling time.
- Preview URLs look like `http://p<id>-<random>.localhost:8090/?pvt=<token>`. The token is exchanged for a cookie on first load and removed from the URL.

## Debugging

Follow a runner pod's output:

```bash
kubectl -n vibecraft-ai logs -l app=runner -c runner --tail=100 -f
kubectl -n vibecraft-ai logs -l app=runner -c syncer --tail=100 -f
```

`GET /api/projects/{id}/preview/logs` shows the same output through the app. To see the pool's state:

```bash
kubectl -n vibecraft-ai get pods -L status,project-id
```

A claimed pod is replaced by a fresh idle one within about a minute. See [troubleshooting](troubleshooting.md#previews) for the error messages the preview panel shows.
