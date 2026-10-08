# Live Previews

Live previews need a real Kubernetes cluster. Without one, every other feature works; only starting a preview fails.

In this setup the backend runs on your machine (`spring-boot:run`) and only the preview pipeline — Redis, the preview proxy, and the runner pods — runs in a local kind cluster, using the manifests in `k8s/`.

> This is different from the **full-stack rehearsal** in `deploy/k8s/overlays/kind/`, which runs the whole application in-cluster to rehearse the production topology. Don't apply both to the same cluster; see that directory's [README](../../deploy/k8s/overlays/kind/README.md).

## Set up the cluster

1. **Create the cluster** with the repository's config:

   ```bash
   kind create cluster --name singularity --config k8s/kind-config.yaml
   ```

   The config sets a kubelet PID limit (`podPidsLimit: 1024`) so a runaway process in a runner pod can't exhaust the node. It applies only when a node is created, so an existing cluster created without it must be recreated.

2. **Apply the base resources**, then the bridge to your local MinIO:

   ```bash
   kubectl apply -f k8s/infra.yml             # namespace singularity-ai, Redis, LimitRange, ResourceQuota
   kubectl apply -f k8s/minio-hostbridge.yml  # points the cluster at MinIO on your machine
   ```

   Don't also apply `k8s/minio.yml` (an in-cluster MinIO): both define a Service named `minio-service`, and the second overwrites the first.

3. **Create the two secrets:**

   ```bash
   # The runner pods' MinIO credential
   kubectl create secret generic minio-runner-credentials -n singularity-ai \
     --from-literal=host-uri='http://minioadmin:minioadmin123@minio-service:9000'

   # The proxy's token secret — must equal PREVIEW_ACCESS_TOKEN_SECRET in .env
   kubectl create secret generic preview-access-token -n singularity-ai \
     --from-literal=secret='<same value as PREVIEW_ACCESS_TOKEN_SECRET>'
   ```

4. **Apply the runner pool and the proxy:**

   ```bash
   kubectl apply -f k8s/runner-pods.yml
   kubectl apply -f k8s/singularity-proxy.yml
   ```

   If you rebuild the proxy image locally, load it into kind first: `kind load docker-image singularity-proxy:latest --name singularity`.

5. **Start the backend** as usual. Nothing else needs to be running:

   - workspace-service reaches the cluster through the kubeconfig context named in `preview.kube-context` (`kind-singularity`, what the command in step 1 creates) — not through whichever context `kubectl` currently points at, so an unset or different current context changes nothing. Override it with `PREVIEW_KUBE_CONTEXT` if your cluster has another name.
   - kind has no load balancer, so Redis (`localhost:6379`) and the preview proxy (`localhost:8090`) have to be forwarded out of the cluster. workspace-service opens both itself at startup (`PreviewPortForwarder`, the `preview.port-forward` block in its `application.yaml`) and re-opens one within a few seconds if its pod is replaced.

   To reach previews while the backend is not running, or with `PREVIEW_PORT_FORWARD_ENABLED=false`, run the helper script in its own terminal instead:

   ```bash
   k8s/dev-port-forward.sh     # macOS, Linux, Git Bash
   k8s/dev-port-forward.ps1    # Windows PowerShell
   ```

   A local port the script already holds is left to it, so running both is harmless.

## What to expect

- The first start of a preview is dominated by `npm install` and can take up to `preview.boot-timeout`. A warm-pool pod is already scheduled, so the wait is install time, not scheduling time.
- When both warm pods are claimed, a start waits in line and begins by itself when a pod comes free; the panel says where you stand. Nothing needs pressing.
- A saved change reaches the preview by itself, and the toolbar says "Updating" until it has and "Up to date" after. A change to `package.json` reinstalls and restarts the dev server on the same pod, also by itself.
- A start that fails because of the platform — the cluster, Redis, storage, a service restarting — is tried again by the preview panel itself, three times and further apart each time, while it goes on showing "Starting your preview". Only a failure of the project's own code (the install, the dev server, a start that never answers) stops at once, with the runner's output and Try again.
- Preview URLs look like `http://p<id>-<random>.localhost:8090/?pvt=<token>`. The token is exchanged for a cookie on first load and removed from the URL.

## The proxy image

The Preview tab talks to a small script the proxy injects into the page (`proxy/reporter.js`). After pulling a change to `proxy/`, rebuild the image and restart the proxy, or the tab's newer features - the address bar's back and forward, the console, blank-page detection - have nothing to talk to:

```bash
docker build -t singularity-proxy:latest proxy
kind load docker-image singularity-proxy:latest --name singularity
kubectl --context kind-singularity -n singularity-ai rollout restart deployment/singularity-proxy
```

## Pre-installed packages, as production has them

`k8s/runner-pods.yml` gives each warm pod an empty `node_modules`, so every local start is a full install. Production seeds it from the runner image (`docker/preview-runner.Dockerfile`). To measure or work with the seeded behaviour locally, the test namespace can be stood up with it: `k8s/preview-test-cluster.sh --context kind-singularity --seed`.

## The real-cluster test

`PreviewPipelineIT` starts a real preview in a namespace of its own on this same cluster and leaves yours alone. See [testing](../practices/testing.md#the-preview-pipeline-test).

## Debugging

Follow a runner pod's output:

```bash
kubectl -n singularity-ai logs -l app=runner -c runner --tail=100 -f
kubectl -n singularity-ai logs -l app=runner -c syncer --tail=100 -f
```

`GET /api/projects/{id}/preview/logs` shows the same output through the app. To see the pool's state:

```bash
kubectl -n singularity-ai get pods -L status,project-id
```

A claimed pod is replaced by a fresh idle one within about a minute. See [troubleshooting](troubleshooting.md#previews) for the error messages the preview panel shows.
