# Infrastructure

The whole application runs as Kubernetes workloads on one machine.

## Machine and cluster

| Item | Value |
|---|---|
| Machine | Oracle Cloud `VM.Standard.A1.Flex`: 2 OCPU, 12 GB RAM, Ubuntu 24.04 (arm64), 100 GB boot volume |
| Kubernetes | k3s, single node, with the built-in Traefik ingress and service load balancer disabled |
| OS updates | Automatic security updates (`unattended-upgrades`) |
| Secrets at rest | k3s secrets encryption enabled |

## Network

- **Inbound web traffic** reaches the cluster only through a Cloudflare tunnel. Cloudflare terminates HTTPS, and `cloudflared` (running in the cluster) forwards each hostname to the right Service.
- **Administration and deploys** reach the Kubernetes API only over Tailscale. SSH is also Tailscale-only; the VM's cloud security list has no open inbound ports.
- **Tunnel routing** lives in the repository (`deploy/k8s/overlays/oracle/cloudflared-config.yaml`):

| Hostname | Path | Destination |
|---|---|---|
| App host | `/api/*`, `/webhooks/*` | `gateway-service` |
| App host | everything else | frontend (nginx) |
| `*.<preview root domain>` | any | `preview-proxy` |
| anything else | — | `404` |

## Hostnames

| Purpose | Pattern |
|---|---|
| The app | `https://<app domain>` — one level below the root domain |
| Previews | `https://p<projectId>-<random>.<preview root domain>` |

Both are exactly one level below the root domain on purpose: Cloudflare's free wildcard certificate covers `*.<root domain>` only, not deeper names. The live demo uses `vibecraft.divyanshuagrahari.dev` for the app and `*.divyanshuagrahari.dev` for previews.

## Namespaces

| Namespace | Workloads | Trust |
|---|---|---|
| `vibecraft` | cloudflared, frontend, gateway, discovery, account, workspace, intelligence, Postgres, MinIO, the nightly backup CronJob | Trusted |
| `vibecraft-ai` | preview proxy, Redis, the runner-pod pool and live previews | Runs untrusted code |

Keeping untrusted runner pods in their own namespace means its network policies never have to reason about trusted workloads alongside them. workspace-service manages runner pods through a narrow cross-namespace Role (see [Kubernetes manifests](kubernetes.md#rbac)).

## Storage

| Volume | Size | Holds |
|---|---|---|
| Postgres | 10 GB | The three service databases |
| MinIO | 20 GB | Project files, content blobs, the starter template |

Both are k3s local-path volumes on the boot disk, backed up nightly to Cloudflare R2 (see [backups](../operations/backups.md)). Redis holds only reconstructible routing state and has no volume.

## External services

| Service | Used for |
|---|---|
| Firebase Authentication | Sign-in |
| OpenRouter | AI calls, with a separate key capped by a hard credit limit |
| Stripe | Billing (test mode on the live demo) |
| Cloudflare | DNS, HTTPS, the tunnel, and R2 for backups |
| Tailscale | Private access for administration and CI |
| GitHub | Source, Actions (CI/CD, monitoring), and Container Registry |
