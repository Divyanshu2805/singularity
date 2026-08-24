# Phase 0: Accounts and one-time setup (owner)

These steps need the owner's identity, card or dashboard logins. About 2–3 hours of clicking, but Oracle capacity and DNS changes can add 1–3 days of waiting, so this starts first.

- [x] **Oracle Cloud:** sign up and pick a home region. It's chosen once at sign-up (nearest to you by default) and is permanent, since free Arm machines only exist there — creating a second account to pick a different one risks losing the free tier entirely. Kept the default, India West (Mumbai): the app's audience is friends and India-based use as well as US recruiters, and Cloudflare caches static assets near every visitor regardless of region.
- [x] **Oracle Pay-As-You-Go:** upgrade the account. It still bills $0 inside the free limits, makes free Arm capacity easier to get, and stops Oracle reclaiming machines it considers idle.
- [x] **Oracle budget alert:** add one at $1 as a tripwire for anything accidentally non-free.
- [x] **Domain:** buy one (~$10–12/year) and move its DNS to a Cloudflare free-plan zone.
- [x] **Cloudflare tunnel:** create a tunnel and keep its credentials file. Its routing rules will live in the repo, not the dashboard.
- [x] **Cloudflare R2:** create a `vibecraft-backups` bucket and an API token scoped to it.
- [x] **Tailscale:** create a free account, an auth key for the VM, and an OAuth client for GitHub Actions.
- [x] **Firebase:** add `app.divyanshuagrahari.dev` to Authentication → Authorized domains.
- [x] **Stripe (test mode):** add a webhook endpoint `https://app.divyanshuagrahari.dev/webhooks/payment` and copy its signing secret.
- [x] **OpenRouter:** create a key used only by the deployed app, with a hard credit limit.
- [x] **GitHub:** create a `production` environment. Its secrets and variables are listed below.

| GitHub environment entry | Type | Holds | Status |
| --- | --- | --- | --- |
| `DB_PASSWORD` | secret | Postgres password (new random value) | ✅ Done |
| `MINIO_ROOT_PASSWORD`, `MINIO_RUNNER_SECRET` | secret | MinIO admin, plus the read-only user preview pods use | ✅ Done |
| `INTERNAL_SERVICE_SHARED_SECRET` | secret | New random value, not the local one | ✅ Done |
| `PREVIEW_ACCESS_TOKEN_SECRET` | secret | New random value, different from the one above | ✅ Done |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | The Firebase Admin key file's contents | ✅ Done |
| `OPENROUTER_API_KEY` | secret | The capped key | ✅ Done |
| `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | secret | Test-mode values | ✅ Done |
| `CLOUDFLARE_TUNNEL_CREDENTIALS` | secret | The tunnel credentials JSON | ⏳ Pending — file handed to the owner, not yet confirmed added |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secret | Backup bucket token | ✅ Done |
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | secret | Lets the pipeline join the tailnet briefly | ✅ Done |
| `KUBE_DEPLOYER_TOKEN` | secret | Namespace-scoped deploy token, created in Phase 4 | ⏳ Phase 4 |
| `APP_DOMAIN`, `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_*` | variable | Public values, safe to show | ✅ Done |

Every secret and variable Phase 0 asked for is set in the `production` environment, restricted to deploys from `main`, except `CLOUDFLARE_TUNNEL_CREDENTIALS` (handed to the owner to paste in) and `KUBE_DEPLOYER_TOKEN`, which needs the deploy identity Phase 4 creates.
