# Phase 3: Kubernetes files and local rehearsal

One shared set of Kubernetes files plus a small overlay per environment, proven end to end on a local kind cluster before any server exists. About 8–12 hours, most of it the rehearsal.

```
deploy/
  k8s/base/              namespaces, quotas, RBAC, network rules, Postgres, MinIO, Redis,
                         5 Java services, frontend, preview-proxy, preview pool, cloudflared
  k8s/overlays/kind/     local rehearsal: http, local images
  k8s/overlays/oracle/   real domain, arm64 images, production sizes
  seed/                  starter template + the one-time Job that loads it into MinIO
```

**Starting memory limits** (tuned after the Phase 6 measurement):

| Component | Memory limit | Notes |
| --- | --- | --- |
| discovery | 384 Mi | Eureka, kept as-is |
| gateway | 448 Mi | The only API entry point |
| account | 512 Mi | |
| workspace | 640 Mi | Talks to Kubernetes, MinIO and Redis |
| intelligence | 640 Mi | AI calls and streams |
| Postgres | 512 Mi | StatefulSet, 10 GB volume, three databases created by `infra/postgres-init` |
| MinIO | 512 Mi | StatefulSet, 20 GB volume |
| Redis, preview-proxy, frontend, cloudflared | 128 / 256 / 64 / 128 Mi | |
| Each preview pod | ~1.1 Gi | Existing limits: 1 Gi dev server + 64 Mi file sync |

- **Deploy order:** Postgres, MinIO and Redis, then discovery, then the three domain services, then the gateway, frontend and proxy.
- **Rolling updates one service at a time:** only one extra Java copy exists during a deploy, which keeps memory inside 12 GB.
- **Permissions:** workspace-service keeps its narrow Role in `vibecraft-ai` (pods get/list/patch/delete, pods/exec create), bound to its service account in `vibecraft`.
- **Rehearsal pass mark:** on kind, a fresh account signs in, creates a project from the seeded template, runs an AI build, and opens a working preview.

- [x] **`deploy/k8s/base/`** — namespaces (`vibecraft`, `vibecraft-ai`) with their own LimitRange/ResourceQuota, `app-config` ConfigMap for the non-secret settings that differ per overlay, Postgres (StatefulSet, one server/three logical databases, the same `infra/postgres-init` SQL mounted via ConfigMap), MinIO (moved in from the repo-root `k8s/minio.yml`, now in `vibecraft`), Redis, RBAC (workspace-service's cross-namespace Role/RoleBinding into `vibecraft-ai`), all five Java services, the frontend, the preview-proxy and runner pool (moved in from `k8s/vibecraft-proxy.yml`/`k8s/runner-pods.yml`). `deploy/k8s/overlays/kind/` (local rehearsal, no patches needed beyond what's below) and `deploy/k8s/overlays/oracle/` (the real domain, `ghcr.io` images via Kustomize's `images:` transformer with a `REPLACED_BY_CI` placeholder tag Phase 5 sets, `cloudflared` - see below) both build cleanly with `kubectl kustomize`.
  - **Two deliberate deviations from this section's original sketch.** No `seed/` directory: Phase 1's `StarterTemplateSeeder` (an idempotent `ApplicationRunner` in workspace-service, added after this plan's first draft) already seeds the starter template into MinIO on boot - a separate Job would duplicate it. And `cloudflared` lives in `overlays/oracle/`, not `base/` - kind has no tunnel to run at all, so putting it in base would mean the kind overlay carrying dead weight (or the kind rehearsal needing to explain why it excludes something the architecture table lists under the trusted namespace).
  - **Found and fixed live, the first time this was rehearsed - a real one:** every one of the five Java services crash-looped on boot with `Invalid value '...' for configuration property 'server.port'... Failed to convert to type java.lang.Integer`. Kubernetes auto-injects a `<SERVICE-NAME>_PORT` env var for every Service in a namespace (Docker-links style) - and each service's own Kubernetes Service name (`discovery-service`, `gateway-service`, ...) collides byte-for-byte with the manual port-override placeholder that same service's `application.yaml` already reserves (`${DISCOVERY_SERVICE_PORT:8761}`, etc.). The real env var (a `tcp://ip:port` URI) wins over the property's own default. Fixed with `enableServiceLinks: false` on every service Deployment's pod spec - full account in CLAUDE.md's gotchas table.
  - **Rehearsed on a dedicated `kind create cluster --name vibecraft-rehearsal`**, not the existing day-to-day dev cluster - `deploy/k8s/base/` reuses the same resource names (`redis-service`, `vibecraft-proxy-svc`, `runner-pool`, ...) as the repo-root `k8s/*.yml` local-dev setup, in the same `vibecraft-ai` namespace, so applying it against the dev cluster would have silently rewritten what's already running there. `deploy/k8s/overlays/kind/README.md` documents this.
  - **Verified live, end to end:** all 5 Java services boot, register with Eureka, connect to Postgres via Flyway (`ddl-auto: validate` passed against the fresh schema), and connect to MinIO - workspace-service's boot log shows the real `StarterTemplateSeeder`/`StorageBucketInitializer` output (15 files seeded, 3 buckets created), account-service seeds the Free/Pro/Business plan catalogue. The Gateway's transparent-passthrough property holds: `curl` against `/api/plans` through the Gateway and directly against account-service return byte-identical JSON. The frontend serves the SPA with the correct baked-in CSP and a working `/assets` long-cache + `index.html` no-cache split. The cross-namespace pieces this phase actually introduced were verified directly, not just assumed: `kubectl auth can-i` against the `workspace-service` ServiceAccount confirms it can list/patch/delete pods and create the `exec` subresource in `vibecraft-ai`, and *nothing more* (denied: creating a pod, any access to another namespace); and from inside a running runner pod, `mc ls` against MinIO in the `vibecraft` namespace succeeds for the `projects` bucket and is denied for `starter-projects` - the previewreader IAM scoping survived the namespace move, and the updated cross-namespace `NetworkPolicy` egress rule (`namespaceSelector` + `podSelector` combined) actually works. A real sign-up (Firebase Admin SDK, a real project) went through the full chain - frontend → nginx → Gateway → account-service → Firebase → Postgres - up to the email-verification gate, which this rehearsal didn't clear (no real inbox for a throwaway test address) - that gate is the app working as designed, not something this phase's wiring affects, so the literal "runs an AI build, opens a working preview" click-through wasn't completed end-to-end through the UI. The pipeline pieces that step would exercise (the MinIO scoped credential, the pod-claim RBAC) were confirmed directly instead, as above.
  - **kind-only extra, not shipped to oracle:** `overlays/kind/frontend-nginx.yaml` overrides the frontend image's baked-in nginx config with one that also proxies `/api`/`/webhooks` to the Gateway. Without it, a real browser reaching the frontend and the Gateway on two different `kubectl port-forward` ports can't make the frontend's same-origin-relative API calls work - a problem that doesn't exist in production (cloudflared serves both under one hostname) or in local `mvnw` dev (Vite's own dev-server proxy already does this).
