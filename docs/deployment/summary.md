# Summary

VibeCraft goes live on one free Oracle Cloud Arm machine (2 cores, 12 GB) running k3s, behind Cloudflare, and redeploys itself from GitHub Actions on every push to `main` that passes the tests. Running cost is $0 a month, plus a domain (~$10/year) and whatever limit is put on the AI key.

- **Audience:** the author, friends, up to ~50 people, recruiters and admissions reviewers.
- **What works live:** sign-in, AI builds, live previews, collaboration, Stripe test-mode checkout.
- **Time to live:** first public URL in about 4–6 working days, fully finished (backups, polish) in about 5–7, roughly 2 calendar weeks at a steady pace.
- **Portable by design:** nothing depends on Oracle, so moving to Hetzner or GKE later is a settings change plus a restore from backup.
