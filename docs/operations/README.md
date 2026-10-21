# Operations

How the live deployment is run day to day. How it's built is in [deployment](../deployment/README.md).

- [Deploys and rollback](deploys.md): shipping a version, redeploying, rolling back, adding or rotating a secret
- [Monitoring](monitoring.md): what the uptime workflow checks and what to do when it fails
- [Backups and restore](backups.md)
- [The demo account](demo-account.md): what the shared login can do, resetting it, turning it off
- [The rename cutover](singularity-cutover.md): moving the old `vibecraft` hostnames over, still in progress

## What runs where

| | |
|---|---|
| App | `https://singularity.divyanshuagrahari.dev` |
| Previews | `https://p<projectId>-<random>.divyanshuagrahari.dev` |
| Cluster | One Oracle Always Free Arm VM (2 OCPU, 12 GB), single-node k3s. No inbound port is open: web traffic comes through a Cloudflare tunnel, admin and deploys over Tailscale |
| `singularity` namespace | cloudflared, frontend, gateway, discovery, account, workspace, intelligence, Postgres, MinIO, the nightly backup CronJob |
| `singularity-ai` namespace | Preview proxy, Redis, the warm runner pool and live previews |
| Manifests | `deploy/k8s/`: `base/`, `overlays/oracle/` (production), `overlays/kind/` (local rehearsal) |
| Backups | Cloudflare R2, 7 nightly copies |
| Config and secrets | The GitHub `production` environment ([configuration](../deployment/configuration.md)) |

Admin uses a kubeconfig pointed at the k3s API over Tailscale. Tailnet names, tunnel credentials and account endpoints aren't in the repo. Keep the production kubeconfig apart from local kind ones and always pass `--context`, since several scripts act on whatever context is current.

## Commands

```bash
kubectl -n singularity get pods
kubectl -n singularity-ai get pods -L status,project-id                # proxy, Redis, pool, live previews
kubectl -n singularity-ai scale deployment/runner-pool --replicas=3    # demo day, see capacity.md
kubectl top nodes; kubectl top pods -A
kubectl -n singularity rollout status deploy/<name>
kubectl -n singularity rollout undo deploy/<name>
kubectl -n singularity logs deploy/<name> --tail=100 -f
kubectl -n singularity get cronjob,jobs                                # the nightly backup
kubectl -n singularity exec -it postgres-0 -- psql -U singularity -d singularity-account-db
```

## Logs

Logs are read with `kubectl logs`. There's no shipping or aggregation, and the kubelet keeps 10 Mi × 5 files per container. Every error response carries a `requestId` that's logged with the full error, so search the owning service's log for the id a user quotes.

Not logged: SQL (`SPRING_JPA_SHOW_SQL=false`), AI prompts and responses (Spring AI's `chat.client` debug logging is never enabled), and credentials (token log lines are counts only, and the proxy never logs access tokens).

## Upkeep

- **OS updates** are automatic (`unattended-upgrades`). After a kernel update the VM may want a reboot, and the stack comes back by itself in about five minutes.
- **k3s patches**, monthly, in a quiet window: take a backup and check it landed ([backups](backups.md#taking-a-backup-now)), read the release notes, then run `curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=<version> sh -` on the VM. Flags stay in `/etc/rancher/k3s/config.yaml`. Check `kubectl get nodes` and run the uptime workflow by hand. Data isn't touched, so rolling back means reinstalling the old version.
- **The domain** renews yearly at the registrar. The tunnel and certificates need nothing.

## Taking real payments

Production runs Stripe in test mode, and the pricing pages say so (`VITE_PAYMENTS_TEST_MODE=true` at build time). To go live:

1. Create the Pro and Business products and recurring prices in Stripe's live mode.
2. Replace `STRIPE_SECRET`, `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS` with live values.
3. Add a live webhook at `https://<app domain>/webhooks/payment` and replace `STRIPE_WEBHOOK_SECRET`.
4. Drop the `VITE_PAYMENTS_TEST_MODE` build arg from the frontend image job in `ci.yml`, then deploy.

Plans are keyed by Stripe price id, so `PlanSeeder` adds rows for the new ids on first start and leaves the test rows alone.

Operational pitfalls (scripts acting on the current context, Secrets that don't change an initialized database, Windows shell quirks) are in [known pitfalls](../practices/gotchas/README.md).
