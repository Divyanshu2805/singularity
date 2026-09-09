# Kubernetes Manifests

Production runs from Kustomize manifests in `deploy/k8s/`: one shared base with an overlay per environment.

```
deploy/k8s/
  namespaces/          namespaces, LimitRanges and ResourceQuotas — a one-time, privileged bootstrap
  base/                everything else: config, Postgres, MinIO, Redis, RBAC, the five Java services,
                       the frontend, the preview proxy and runner pool, the nightly backup
  overlays/kind/       local full-stack rehearsal: http, locally built images
  overlays/oracle/     production: the real domains, GHCR images, cloudflared, the deploy identity
```

```bash
kubectl apply -k deploy/k8s/overlays/oracle     # production (done by CI)
kubectl apply -k deploy/k8s/overlays/kind       # local rehearsal
```

> `k8s/` at the repository root is a different thing: manifests for running only the preview pipeline in a local cluster while the backend runs on your machine. See [live previews](../local-development/live-previews.md).

## Base

- **`app-config` ConfigMap** — non-secret settings that differ between environments (domains, the AI model). See [configuration](configuration.md).
- **Postgres** — a StatefulSet with a 10 GB volume. One server, three databases, created by the same `infra/postgres-init` SQL used locally.
- **MinIO** — a StatefulSet with a 20 GB volume, non-root, plus a bootstrap Job that creates the read-only `previewreader` user the runner pods use.
- **Redis** — preview routing state only, no volume.
- **The five Java services** — each a Deployment with `enableServiceLinks: false` (see [the pitfall](../practices/gotchas/kubernetes.md#kubernetes-service-links-collide-with-port-properties)), probes on management port `9404`, and a non-root security context.
- **Frontend, preview proxy, runner pool** — the runner pool's init container seeds each warm pod's `node_modules` from the pre-built runner image.
- **Nightly backup** — a CronJob; see [backups](../operations/backups.md).

## Overlays

- **`oracle`** maps every image to `ghcr.io/divyanshu2805/vibecraft-<name>` with a placeholder tag that CI replaces with the commit SHA; adds `cloudflared` with its routing config (generated with `configMapGenerator`, so a config change restarts the pod); and holds `deployer-bootstrap.yaml`, the deploy identity applied once out-of-band.
- **`kind`** uses locally built `:local` images, includes `namespaces/` directly (a kind admin has full rights), and adds an nginx config that proxies `/api` so the frontend works through `kubectl port-forward`. See the overlay's [README](../../deploy/k8s/overlays/kind/README.md) to run the rehearsal.

## Resource limits

| Component | Memory limit | Notes |
|---|---|---|
| discovery | 384 Mi | |
| gateway | 448 Mi | |
| account | 512 Mi | |
| workspace | 640 Mi | Talks to Kubernetes, MinIO and Redis |
| intelligence | 640 Mi | AI calls and streams |
| Postgres | 512 Mi | |
| MinIO | 512 Mi | |
| Redis / preview proxy / frontend / cloudflared | 128 / 256 / 64 / 128 Mi | |
| Each preview pod | about 1.1 Gi | 1 Gi dev server + 64 Mi file sync |

Java services run with `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Xss512k` to stay inside their limits. Namespace quotas cap the preview namespace so previews can never starve the services. See [capacity](capacity.md).

## Deploy order

Rollouts proceed in dependency order — Postgres, MinIO and Redis; then discovery; then the three domain services; then the Gateway, frontend and proxy — and one Java service at a time, so at most one extra Java process exists during a deploy.

## RBAC

- **workspace-service** has a Role in `vibecraft-ai`, bound to its service account in `vibecraft`: pods `get`, `list`, `patch`, `delete`, and `pods/exec` `get` + `create` (exec is a WebSocket `GET`). It cannot create pods or touch other namespaces.
- **The `deployer` service account** used by CI is bound to the built-in `admin` role in each app namespace only, plus read-only access to namespaces. It is not a cluster admin. Because `admin` excludes namespaces, LimitRanges and ResourceQuotas, those live in `deploy/k8s/namespaces/` and are applied once with a privileged kubeconfig.
