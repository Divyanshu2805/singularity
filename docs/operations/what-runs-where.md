# What runs where

| Piece | Where |
| --- | --- |
| App | `https://vibecraft.divyanshuagrahari.dev` - one level under the domain, because Cloudflare's free wildcard certificate covers only one subdomain level |
| Previews | `https://p<projectId>-<random>.divyanshuagrahari.dev` (the same wildcard) |
| Cluster | One Oracle Always Free Arm VM (2 OCPU, 12 GB) running single-node k3s. No inbound port is open: web traffic arrives through a Cloudflare tunnel, admin and deploys over Tailscale |
| Namespaces | `vibecraft` (cloudflared, frontend, gateway, discovery, account, workspace, intelligence, Postgres, MinIO, the backup CronJob) and `vibecraft-ai` (preview proxy, Redis, the warm runner pool) |
| Manifests | `deploy/k8s/` - `base/` plus `overlays/oracle/` (production) and `overlays/kind/` (local rehearsal) |

Admin access is a kubeconfig whose server URL is the k3s API over Tailscale. Keep it separate from a local kind kubeconfig and always pass `--context` explicitly - see "Traps" below for why.
