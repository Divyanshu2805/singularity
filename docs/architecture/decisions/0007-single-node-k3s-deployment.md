# 0007. A single k3s node behind a tunnel, with portable manifests

**Status:** Accepted

## Context

The deployment serves a demo audience of tens of users, and it has to run live previews — which need Kubernetes — at close to zero cost. Managed Kubernetes and managed databases would cost more than the whole project's budget. At the same time, the setup must not be locked to one provider, whose free tier could change at any time.

## Decision

Run everything on one Oracle Cloud Always Free Arm VM (2 OCPU, 12 GB) as single-node k3s:

- **No open inbound ports.** Web traffic arrives through a Cloudflare tunnel (Cloudflare terminates HTTPS); deploys and administration arrive over Tailscale.
- **All state in-cluster** (Postgres, MinIO, Redis) on local volumes, with a nightly off-machine backup to Cloudflare R2.
- **Portable manifests.** One Kustomize `base/` with an overlay per environment (`kind` for local rehearsal, `oracle` for production). Nothing in the images or pipeline is Oracle-specific.
- **Continuous deployment from GitHub Actions**, with a smoke test and automatic rollback, and every Kubernetes Secret rebuilt from a GitHub environment on each deploy.

## Consequences

- Running cost is about $0 a month, plus the domain and a capped AI key.
- The single machine is a single point of failure. Recovery is a restore from backup onto a new VM, and moving providers is a settings change plus a restore, with the URL unchanged.
- CPU, not memory, limits how many previews can start at once. See [capacity](../../deployment/capacity.md).
- Scaling beyond one node — a separate preview node pool, managed Postgres — reuses the same images and manifests. See [growth path](../../deployment/risks-and-growth.md#growth-path).
