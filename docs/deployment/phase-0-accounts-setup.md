# Phase 0: Accounts and one-time setup (owner)

These steps need the owner's identity, card or dashboard logins. About 2–3 hours of clicking, but Oracle capacity and DNS changes can add 1–3 days of waiting, so this starts first.

- [ ] **Oracle Cloud:** sign up and pick a large US home region, e.g. Ashburn or Phoenix. The home region is permanent, and free Arm machines only exist there.
- [ ] **Oracle Pay-As-You-Go:** upgrade the account. It still bills $0 inside the free limits, makes free Arm capacity easier to get, and stops Oracle reclaiming machines it considers idle.
- [ ] **Oracle budget alert:** add one at $1 as a tripwire for anything accidentally non-free.
- [ ] **Domain:** buy one (~$10–12/year) and move its DNS to a Cloudflare free-plan zone.
- [ ] **Cloudflare tunnel:** create a tunnel and keep its credentials file. Its routing rules will live in the repo, not the dashboard.
- [ ] **Cloudflare R2:** create a `vibecraft-backups` bucket and an API token scoped to it.
- [ ] **Tailscale:** create a free account, an auth key for the VM, and an OAuth client for GitHub Actions.
- [ ] **Firebase:** add `app.<domain>` to Authentication → Authorized domains.
- [ ] **Stripe (test mode):** add a webhook endpoint `https://app.<domain>/webhooks/payment` and copy its signing secret.
- [ ] **OpenRouter:** create a key used only by the deployed app, with a hard credit limit.
- [ ] **GitHub:** create a `production` environment. Its secrets and variables are listed below.

| GitHub environment entry | Type | Holds |
| --- | --- | --- |
| `DB_PASSWORD` | secret | Postgres password (new random value) |
| `MINIO_ROOT_PASSWORD`, `MINIO_RUNNER_SECRET` | secret | MinIO admin, plus the read-only user preview pods use |
| `INTERNAL_SERVICE_SHARED_SECRET` | secret | New random value, not the local one |
| `PREVIEW_ACCESS_TOKEN_SECRET` | secret | New random value, different from the one above |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | The Firebase Admin key file's contents |
| `OPENROUTER_API_KEY` | secret | The capped key |
| `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | secret | Test-mode values |
| `CLOUDFLARE_TUNNEL_CREDENTIALS` | secret | The tunnel credentials JSON |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secret | Backup bucket token |
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | secret | Lets the pipeline join the tailnet briefly |
| `KUBE_DEPLOYER_TOKEN` | secret | Namespace-scoped deploy token, created in Phase 4 |
| `APP_DOMAIN`, `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_*` | variable | Public values, safe to show |
