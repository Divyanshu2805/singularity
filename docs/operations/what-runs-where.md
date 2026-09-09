# What Runs Where

| Piece | Where |
|---|---|
| App | `https://vibecraft.divyanshuagrahari.dev` |
| Previews | `https://p<projectId>-<random>.divyanshuagrahari.dev` |
| Cluster | One Oracle Always Free Arm VM (2 OCPU, 12 GB) running single-node k3s. No inbound port is open: web traffic arrives through a Cloudflare tunnel, administration and deploys over Tailscale |
| Namespace `vibecraft` | cloudflared, frontend, gateway, discovery, account, workspace, intelligence, Postgres, MinIO, the nightly backup CronJob |
| Namespace `vibecraft-ai` | Preview proxy, Redis, the warm runner pool and live previews |
| Manifests | `deploy/k8s/` — `base/` plus `overlays/oracle/` (production) and `overlays/kind/` (local rehearsal) |
| Backups | Cloudflare R2, 7 nightly copies |
| Configuration and secrets | The GitHub `production` environment ([configuration](../deployment/configuration.md)) |

## Admin access

Administration uses a kubeconfig whose server is the k3s API over Tailscale. Server-specific identifiers — IP addresses, the tailnet hostname, account and tunnel ids — are deliberately not in the repository; they live in the GitHub environment and the operator's own kubeconfig.

Keep the production kubeconfig separate from any local kind cluster's, and always pass `--context` explicitly. Several scripts act on whatever context is current.
