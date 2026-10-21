# Deployment

Production is one free-tier Oracle Arm VM running single-node k3s. Visitors come in through a Cloudflare tunnel, and GitHub Actions deploys over Tailscale. The VM has no open inbound ports. Why it's built this way is in [ADR 0007](../architecture/decisions/0007-single-node-k3s-deployment.md). Running it day to day is in [operations](../operations/README.md).

- [Kubernetes manifests](kubernetes.md): `deploy/k8s/` layout, overlays, resource limits, RBAC, the kind rehearsal
- [Container images](container-images.md): the eight images and how each is built
- [CI/CD](ci-cd.md): tests, image builds, approval, deploy, smoke test, rollback
- [Configuration and secrets](configuration.md): the GitHub `production` environment and what each service gets
- [Provisioning](provisioning.md): a new environment from scratch
- [Capacity](capacity.md): memory and CPU budgets, how many previews fit, measured start times

## The machine

| | |
|---|---|
| VM | Oracle `VM.Standard.A1.Flex`: 2 OCPU, 12 GB, Ubuntu 24.04 arm64, 100 GB boot volume |
| Kubernetes | k3s, single node, Traefik and the service load balancer turned off, secrets encryption on |
| Updates | `unattended-upgrades` |
| Storage | k3s local-path volumes: Postgres 10 GB, MinIO 20 GB. Redis holds only routes and has no volume. Nightly backup to Cloudflare R2 ([backups](../operations/backups.md)) |

## Network

Cloudflare terminates HTTPS and `cloudflared`, running in the cluster, forwards each hostname. The routing lives in `deploy/k8s/overlays/oracle/cloudflared-config.yaml`:

| Hostname | Path | Goes to |
|---|---|---|
| App host | `/api/*`, `/webhooks/*` | `gateway-service` |
| App host | anything else | frontend (nginx) |
| `*.<root domain>` | any | `preview-proxy` (previews and published apps) |
| anything else | — | `404` |

The app is `singularity.divyanshuagrahari.dev` and previews are `p<projectId>-<random>.divyanshuagrahari.dev`. Both sit exactly one level below the root domain, because Cloudflare's free wildcard certificate only covers `*.<root>`. The old `vibecraft.divyanshuagrahari.dev` hostname is still routed during the [rename](../operations/singularity-cutover.md).

The k3s API and SSH are reachable only over Tailscale.

## Namespaces

| Namespace | Runs | Trust |
|---|---|---|
| `singularity` | cloudflared, frontend, gateway, discovery, account, workspace, intelligence, Postgres, MinIO, backup CronJob | trusted |
| `singularity-ai` | preview proxy, Redis, the runner pool and live previews | runs untrusted code |

Keeping the runner pods in their own namespace means its network policies never have to reason about trusted workloads. workspace-service manages runner pods through a narrow cross-namespace Role ([RBAC](kubernetes.md#rbac)).

## Cost

About $0 a month. The VM (Oracle Always Free), k3s, Cloudflare (DNS, tunnel, R2 up to 10 GB), Tailscale, GitHub Actions and GHCR for a public repo, Firebase Auth and Stripe test mode are all free. What's left is the domain (about $10–12 a year) and the model API key, which has a hard spending cap.

Nothing is tied to Oracle. The same images and manifests run on kind, so moving hosts means restoring a backup onto a new cluster and pointing the tunnel at it. DNS doesn't change.

## Risks

| Risk | What happens |
|---|---|
| The free tier shrinks or ends | Restore the R2 backup onto another host with the same manifests. Cloudflare keeps the URL. Hetzner CX43 (~€16/month) or a GKE spot node (~$15–20/month) would both work |
| The VM dies | The uptime check alerts. Rebuild from backup in about 1–2 hours |
| The account is suspended | Backups are on R2, outside Oracle |
| Preview code shares the machine | Non-root pods, no capabilities, network policies, PID limits and quotas. A bigger setup would move previews to their own node |
| Model spend | Hard cap on the key, plus per-user daily token limits in the app |

## Growing past one VM

| Stage | For | Changes |
|---|---|---|
| Now | up to ~50 people | One free VM, everything in-cluster |
| Small beta | hundreds | A separate machine for previews, managed Postgres via `SPRING_DATASOURCE_URL`, a bigger main VM |
| Public | open sign-up | Managed Kubernetes with a sandboxed preview node pool, autoscaling, managed Postgres and Redis, live Stripe |

Before running more than one copy of any service, deal with the [per-process state](../known-gaps/constraints-and-trade-offs.md#some-state-is-per-process-not-per-system).

## Checks for a new environment

The first deploy to a real HTTPS origin catches what local testing can't: cookies and CSRF behind the real origin, live reload through the tunnel, sign-in on a new domain.

- Firebase's authorized domains include the app host (or Google sign-in fails)
- The Stripe webhook points at `https://<app domain>/webhooks/payment` (or upgrades silently never arrive)
- The app loads with a valid certificate, and refreshing a deep link works. `/api/plans` returns JSON
- Google and email sign-in work, sign-out works, and a second account sees none of the first one's projects
- A new project starts from the template, a build streams and saves, and code insight answers
- A preview loads and an AI edit shows up in it live
- A viewer can't edit and a non-member is denied
- Test checkout with `4242 4242 4242 4242` upgrades the plan via the webhook, and hitting a quota shows the limit message
- `/api/internal/...` through the tunnel is a Gateway `404`
- After a VM reboot everything comes back within about five minutes
- A few previews in a row, measured with `kubectl top` ([capacity](capacity.md))
- One backup by hand lands in R2, and the uptime workflow passes
