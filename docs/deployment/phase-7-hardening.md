# Phase 7: Hardening, backups, monitoring, polish

This phase makes the demo safe to leave running for months and good to show. About 4–6 hours.

- [ ] **Nightly backup** (Kubernetes CronJob): `pg_dump` of the three databases plus a copy of the MinIO buckets to Cloudflare R2, keeping 7 days. Do one real restore drill onto kind.
- [ ] **Uptime monitor** on `https://app.divyanshuagrahari.dev` and `/api/plans`, emailing the owner when either fails.
- [ ] **Updates:** automatic OS security updates, plus a monthly k3s patch upgrade.
- [ ] **Logs:** SQL logging off, log files capped in size, no secrets or preview tokens in logs.
- [ ] **Faster previews:** switch the preview pool to the pre-baked runner image from Phase 2.
- [ ] **Demo polish:** seed one or two finished example projects, and show a banner in the app reading "Payments are in Stripe test mode: use card 4242 4242 4242 4242".
- [ ] **README:** a "Live demo" link, an architecture diagram, and a 2-minute walkthrough video as a fallback if the site is ever down.
- [ ] **Repo docs:** update `docs/architecture/`, `docs/local-development/` and `CLAUDE.md` with the deploy setup, per the repo's own definition of done.
