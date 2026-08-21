# Phase 4: Provision the Oracle machine

The owner creates the VM in the Oracle console; everything after it is scripted. About 3–4 hours, plus waiting if Oracle reports no free Arm capacity.

1. **Create the VM (owner, in the console):** shape `VM.Standard.A1.Flex`, 2 OCPU, 12 GB, Ubuntu 24.04 (aarch64), 100 GB boot volume, a public IP for first login. If it says "out of host capacity", try another availability domain or retry later.
2. **Base OS:** apply updates, turn on automatic security updates, and loosen the Oracle Ubuntu image's strict default iptables rules, which otherwise block Kubernetes pod networking.
3. **Tailscale on the VM,** then close port 22 in the Oracle security list. From then on the machine has zero open inbound ports, and SSH goes over Tailscale.
4. **Install k3s** with:
    - `--disable traefik --disable servicelb`: the tunnel replaces both.
    - `--kubelet-arg=pod-max-pids=1024`: the fork-bomb limit `k8s/kind-config.yaml` already sets.
    - `--secrets-encryption`: Kubernetes secrets are encrypted on disk.
    - `--tls-san <tailscale name>`: the API is reachable only over the tailnet.
5. **Deploy identity:** a `deployer` service account limited to the two app namespaces (no cluster-admin). Its token becomes the `KUBE_DEPLOYER_TOKEN` GitHub secret.
6. **Tunnel routing:** cloudflared runs as a Deployment with rules kept in the repo: `app.<domain>` paths `/api/*` and `/webhooks/*` go to the gateway, the rest to the frontend, and `*.<domain>` goes to the preview-proxy. In Cloudflare DNS, `app` and `*` both point at the tunnel.
7. **Secrets:** the pipeline creates the Kubernetes secrets from the GitHub environment on every deploy, so the server never needs a hand-edited secret file.
