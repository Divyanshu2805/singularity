# Kind rehearsal overlay

The **full-stack rehearsal** of the production topology: every component (Postgres, MinIO, the five Java services,
the frontend and the preview pipeline) running in-cluster on `kind`, using the same `deploy/k8s/base` the production
overlay uses. See [Kubernetes manifests](../../../../docs/deployment/kubernetes.md) for how the manifests fit together.

This is a different exercise from the day-to-day loop in [live previews](../../../../docs/local-development/live-previews.md),
where the backend runs on your machine and only the preview pipeline lives in kind. Don't run both against the same cluster.

## 1. Create a dedicated cluster

Don't reuse the day-to-day dev cluster (`kind get clusters` may already show one named `vibecraft`) - this
rehearsal's namespaces and Deployments would collide with what's already running there. Use a separate name:

```bash
kind create cluster --name vibecraft-rehearsal --config ../../../../k8s/kind-config.yaml
```

## 2. Build and load the 8 images

From the repo root, after `./mvnw clean package` and `cd frontend && npm run build` have produced what each
Dockerfile needs (docker/java-service.Dockerfile copies a pre-built jar; frontend/Dockerfile builds its own bundle
from source, so skip the separate `npm run build`):

```bash
for m in discovery gateway account workspace intelligence; do
  docker build -f docker/java-service.Dockerfile --build-arg MODULE=${m}-service -t vibecraft-${m}:local .
done
docker build -t vibecraft-preview-proxy:local proxy/
docker build -f docker/preview-runner.Dockerfile -t vibecraft-preview-runner:local \
  workspace-service/src/main/resources/starter-templates/react-vite-tailwind-daisyui-starter
docker build \
  --build-arg VITE_FIREBASE_API_KEY=<from Firebase console> \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=vibecraftai-5ac98.firebaseapp.com \
  --build-arg VITE_FIREBASE_PROJECT_ID=vibecraftai-5ac98 \
  --build-arg VITE_FIREBASE_APP_ID=<from Firebase console> \
  --build-arg VITE_CSP_FRAME_ORIGINS="http://localhost:*" \
  -t vibecraft-frontend:local frontend/

for img in discovery gateway account workspace intelligence preview-proxy preview-runner frontend; do
  kind load docker-image vibecraft-${img}:local --name vibecraft-rehearsal
done
```

## 3. Create the secrets

Every `kubectl create secret` command this overlay needs is documented in the base manifest that consumes it
(`deploy/k8s/base/*.yaml` - search for `kubectl create secret`). Run each one against the `vibecraft-rehearsal`
context before applying. For a rehearsal (not real user data), dummy values are fine for Stripe/OpenRouter/Firebase
except: Firebase must be a real service account JSON (sign-in genuinely needs it), and `PREVIEW_ACCESS_TOKEN_SECRET`/
`INTERNAL_SERVICE_SHARED_SECRET`/`MINIO_RUNNER_SECRET` must be real random strings, not blank - the app treats a
missing one as a startup failure by design (CLAUDE.md: "every secret is a bare env-var placeholder, no fallback").

## 4. Apply and rehearse

```bash
kubectl apply -k .
kubectl -n vibecraft get pods -w    # wait for everything Ready
kubectl -n vibecraft-ai get pods -w
```

Then port-forward the three entry points a browser needs and walk through the
[release checklist](../../../../docs/deployment/release-checklist.md) against `http://localhost:8080`:

```bash
kubectl -n vibecraft port-forward svc/frontend 8080:80
kubectl -n vibecraft port-forward svc/gateway-service 8000:8000
kubectl -n vibecraft-ai port-forward svc/vibecraft-proxy-svc 8090:80
```

## Cleanup

```bash
kind delete cluster --name vibecraft-rehearsal
```
