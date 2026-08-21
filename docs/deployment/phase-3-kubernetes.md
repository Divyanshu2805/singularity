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
