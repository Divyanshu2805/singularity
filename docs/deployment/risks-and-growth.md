# Risks and Growth

## Risks

The largest risk is the cloud provider changing its free tier, which Oracle has done before. Portable manifests plus off-machine backups turn that into a move of a few hours, with the same URL.

| Risk | Mitigation |
|---|---|
| The free tier shrinks or ends | The same manifests and pipeline deploy anywhere: restore the R2 backup onto a fallback host; Cloudflare keeps the URL |
| No free Arm capacity when provisioning | Pay-As-You-Go; retry another availability domain or later |
| The VM is reclaimed as idle | Unlikely, since memory use stays well above the idle threshold; Pay-As-You-Go removes the risk |
| The machine fails | The uptime check alerts; rebuild from backup on a new VM in about 1–2 hours |
| The cloud account is suspended | Backups live on Cloudflare R2, outside the provider |
| Preview code shares the machine | Non-root pods, no capabilities, network policies, a PID limit and quotas; previews move to their own machine at growth stage 2 |
| AI spend | A hard credit limit on the key, plus per-user daily token quotas in the app |

## Fallback hosts

Both reuse the same images, manifests and pipeline.

| Option | Approximate cost | Trade-off |
|---|---|---|
| [Hetzner](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) CX43 (8 vCPU / 16 GB) + k3s | ~€16/month | Always on and faster; the cheapest sizes are EU-only |
| GKE zonal cluster + one spot `e2-standard-4` | ~$15–20/month ([node price](https://gcloud-compute.com/e2-standard-4.html)) | Managed Kubernetes; a few short outages a month when the spot node is reclaimed |

## Growth path

Each stage reuses the same images, manifests and pipeline; only the overlay, the target cluster and a few connection settings change.

| Stage | Audience | What changes |
|---|---|---|
| 1 — now | Up to ~50 people | One free VM, everything in-cluster |
| 2 — small public beta | Hundreds of users | A second machine just for previews (capacity and isolation), managed Postgres via `SPRING_DATASOURCE_URL`, a larger main VM |
| 3 — public launch | Open sign-up | Managed Kubernetes with a sandboxed preview node pool, autoscaling, managed Postgres and Redis, live Stripe mode |

Moving between stages follows the same steps: bring up the new cluster, point the pipeline at it, restore the latest backup, and start the tunnel there. DNS never changes. Before running more than one instance of any service, address the [per-process state](../known-gaps/constraints-and-trade-offs.md#some-state-is-per-process-not-per-system).
