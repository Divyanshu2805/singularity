# Provisioning a New Environment

Standing up a production environment from nothing. Expect a few hours of setup, plus waiting on cloud capacity and DNS propagation.

## 1. Accounts

| Account | Set up |
|---|---|
| Oracle Cloud | Sign up and choose a home region — it's permanent, and free Arm capacity exists only there. Upgrade to Pay-As-You-Go (still free within Always Free limits; makes capacity easier to get and stops idle reclamation) and add a small budget alert as a tripwire. |
| Domain | Register a domain and move its DNS to a Cloudflare free-plan zone. |
| Cloudflare | Create a tunnel and keep its credentials file. Create an R2 bucket for backups and an API token scoped to it. |
| Tailscale | Create an auth key for the VM, and an OAuth client for CI with scope **Auth Keys: Write** and tag `tag:ci`. |
| Firebase | Add the app's hostname under Authentication → Authorized domains. |
| Stripe | Add a webhook endpoint `https://<app domain>/webhooks/payment` and copy its signing secret. |
| OpenRouter | Create a key used only by this deployment, with a hard credit limit. |
| GitHub | Create a `production` environment restricted to `main` and fill in every [secret and variable](configuration.md). |

## 2. The VM

1. Create an `VM.Standard.A1.Flex` instance (2 OCPU, 12 GB, Ubuntu 24.04 aarch64, 100 GB boot volume) with a public IP for first login. If the console reports "out of host capacity", try another availability domain or retry later.
2. Apply updates and enable automatic security updates.
3. Relax the Oracle Ubuntu image's default iptables rules, which otherwise block pod networking.
4. Install Tailscale, then remove SSH (port 22) from the security list. From then on the machine has no open inbound ports.

## 3. k3s

Install k3s with:

| Flag | Why |
|---|---|
| `--disable traefik --disable servicelb` | The Cloudflare tunnel replaces both |
| `--kubelet-arg=pod-max-pids=1024` | A PID limit per pod, so a fork bomb in a preview can't exhaust the node |
| `--secrets-encryption` | Encrypts Kubernetes Secrets at rest |
| `--tls-san <tailscale hostname>` | Makes the API reachable, and valid, only over the tailnet |

The flags are persisted in `/etc/rancher/k3s/config.yaml`.

## 4. Cluster bootstrap

With a privileged kubeconfig, once:

```bash
kubectl apply -k deploy/k8s/namespaces                               # namespaces, LimitRanges, ResourceQuotas
kubectl apply -f deploy/k8s/overlays/oracle/deployer-bootstrap.yaml  # the CI deploy identity
```

Then read the `deployer-token` Secret in `vibecraft` into the `KUBE_DEPLOYER_TOKEN` GitHub secret, and set `KUBE_API_SERVER` to `https://<tailscale hostname>:6443`.

## 5. DNS

In Cloudflare, point both the app hostname and the `*` wildcard at the tunnel. The tunnel's routing rules are part of the `oracle` overlay and take effect on the first deploy.

## 6. First deploy

Run the CI workflow (see [CI/CD](ci-cd.md)), then work through the [release checklist](release-checklist.md). After the first deploy, run one backup by hand and the uptime workflow once to prove the backup path end to end (see [backups](../operations/backups.md)).
