# Costs

Everything except the domain and the AI key is on a permanent free tier: $0 a month, about $10–12 a year all-in plus the AI cap.

| Component | Choice | Cost |
| --- | --- | --- |
| Server | [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) Arm VM: 2 OCPU, 12 GB, up to 200 GB disk, 10 TB/month outbound | $0 |
| Kubernetes | k3s | $0 |
| HTTPS, DNS, tunnel | Cloudflare free plan | $0 |
| CI/CD | GitHub Actions (the repo is public) | $0 |
| Image registry | GitHub Container Registry, public images | $0 |
| Private deploy and admin access | Tailscale free plan | $0 |
| Off-machine backups | [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/): 10 GB-month storage free, free egress | $0 |
| Uptime alerts | A scheduled GitHub Actions workflow (a dedicated monitor such as UptimeRobot can be added alongside) | $0 |
| Auth | Firebase Auth | $0 |
| Payments | Stripe test mode | $0 |
| Domain | Any registrar, DNS moved to Cloudflare | ~$10–12/year |
| AI | A separate OpenRouter key with a hard credit limit | the cap, e.g. $5 |

The images and pipeline don't bake in any Oracle-specific service, so none of these choices lock the project in.
