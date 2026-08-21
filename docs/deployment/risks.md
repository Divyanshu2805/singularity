# Risks and fallback

The biggest risk is Oracle changing its free tier again, as it did on June 15, 2026 ([InfoQ](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)). The portable setup plus off-machine backups turns that into a 2–3 hour move with the same URL.

| Risk | Mitigation |
| --- | --- |
| Oracle shrinks or ends the free tier | Same files and pipeline deploy anywhere; restore the R2 backup onto a fallback; Cloudflare keeps the URL unchanged |
| No free Arm capacity at sign-up | Pay-As-You-Go upgrade; retry another availability domain or a later time |
| Oracle reclaims the VM as idle | Unlikely, since the app keeps memory well above Oracle's 20% idle threshold; Pay-As-You-Go removes the risk |
| The one machine fails | The uptime alert fires; rebuild from backup on a new VM in about 1–2 hours |
| Oracle suspends the account | Backups live on Cloudflare R2, outside Oracle |
| Generated preview code shares the machine | Non-root pods, no capabilities, network rules, PID limit and quotas; previews get their own machine at growth stage 2 |
| AI spend | Hard credit limit on the key, plus the app's per-user daily token quotas |

**Fallbacks, using the same files and pipeline:**

| Option | Per month | Tradeoff |
| --- | --- | --- |
| Hetzner CX43 (8 vCPU / 16 GB) + k3s | [€15.99](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) | Always on and faster; the cheap sizes are EU-only |
| GKE zonal cluster + one spot `e2-standard-4` in us-west4 | ~$15–20 ([node price](https://gcloud-compute.com/e2-standard-4.html)) | Managed Kubernetes; a few short outages a month when Google reclaims the spot node |
