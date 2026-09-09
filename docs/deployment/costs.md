# Costs

Everything except the domain and the AI key runs on a permanent free tier: about **$0 a month**, or $10–12 a year plus the AI credit cap.

| Component | Choice | Cost |
|---|---|---|
| Server | [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) Arm VM: 2 OCPU, 12 GB, up to 200 GB disk, 10 TB/month outbound | $0 |
| Kubernetes | k3s | $0 |
| HTTPS, DNS, tunnel | Cloudflare free plan | $0 |
| CI/CD | GitHub Actions (public repository) | $0 |
| Image registry | GitHub Container Registry, public images | $0 |
| Private administration access | Tailscale free plan | $0 |
| Off-machine backups | [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/): 10 GB-month free, free egress | $0 |
| Uptime monitoring | A scheduled GitHub Actions workflow | $0 |
| Authentication | Firebase Authentication | $0 |
| Payments | Stripe (test mode) | $0 |
| Domain | Any registrar, DNS on Cloudflare | ~$10–12/year |
| AI | A dedicated OpenRouter key with a hard credit limit | The cap, e.g. $5 |

None of these choices locks the project in: the images and pipeline use no provider-specific service.
