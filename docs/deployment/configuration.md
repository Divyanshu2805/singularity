# Configuration and Secrets

All production configuration lives in the GitHub **`production` environment**, restricted to deploys from `main`. On every deploy, `deploy/scripts/apply-secrets.sh` turns its secrets into Kubernetes Secrets, and the workflow passes its variables into image builds and manifests. Nothing is hand-edited on the server.

Server-specific identifiers — IP addresses, the tailnet hostname, account and tunnel ids — are deliberately kept out of the repository and live only in this environment.

## Secrets

| Name | Holds |
|---|---|
| `DB_PASSWORD` | The Postgres password |
| `MINIO_ROOT_PASSWORD` | The MinIO admin password |
| `MINIO_RUNNER_SECRET` | The password of the read-only MinIO user the preview pods use |
| `INTERNAL_SERVICE_SHARED_SECRET` | The internal-API secret — a new random value, never the local one |
| `PREVIEW_ACCESS_TOKEN_SECRET` | Signs preview access tokens — a different random value |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The Firebase Admin service-account key file's contents |
| `OPENROUTER_API_KEY` | A key used only by the deployment, with a hard credit limit |
| `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Stripe keys and price ids |
| `CLOUDFLARE_TUNNEL_CREDENTIALS` | The tunnel's credentials JSON |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` | The backup bucket's token and S3 endpoint (`https://<account id>.r2.cloudflarestorage.com`) |
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | A Tailscale OAuth client (scope **Auth Keys: Write**, tag `tag:ci`) that lets CI join the tailnet |
| `KUBE_API_SERVER` | The k3s API's URL over Tailscale |
| `KUBE_DEPLOYER_TOKEN` | The namespace-scoped `deployer` service-account token |

## Variables

These are public values, safe to show.

| Name | Holds |
|---|---|
| `APP_DOMAIN` | The app's hostname, e.g. `vibecraft.divyanshuagrahari.dev` |
| `PREVIEW_ROOT_DOMAIN` | The parent domain of preview hostnames, e.g. `divyanshuagrahari.dev` |
| `FIREBASE_PROJECT_ID` | The Firebase project id |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | The Firebase web config baked into the frontend |

## Settings the services receive

Non-secret settings are set as environment variables or `app-config` entries in the manifests:

| Setting | Production value |
|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/vibecraft-<service>-db` |
| `SPRING_DATA_REDIS_HOST` | `redis-service.vibecraft-ai` |
| `MINIO_URL` | `http://minio-service:9000` |
| `EUREKA_SERVER_URL` | `http://discovery-service:8761/eureka/` |
| `CLIENT_URL` | `https://<app domain>` |
| `PREVIEW_PUBLIC_SCHEME`, `PREVIEW_PUBLIC_DOMAIN`, `PREVIEW_PUBLIC_PORT` | `https`, the preview root domain, `443` |
| `FIREBASE_CREDENTIALS_PATH` | `/var/secrets/firebase/sa.json`, mounted from the `firebase-service-account` Secret |
| `SPRING_JPA_SHOW_SQL` | `false` |
| `SPRING_AI_OPENAI_CHAT_OPTIONS_MODEL` | From `app-config`'s `ai-model` key — change that one key to use a different model |

The frontend image is built with `VITE_CSP_FRAME_ORIGINS=https://*.<preview root domain>` and `VITE_PAYMENTS_TEST_MODE=true` while Stripe runs in test mode.

## Adding a secret

1. Add it to the `production` environment.
2. Add it to the required-variable list and an `apply` call in `deploy/scripts/apply-secrets.sh`.
3. Pass it in the `deploy` job's `env:` in `ci.yml`.
4. Reference it from the manifest that needs it.

Rotating the Postgres or MinIO password needs care — see [rotating a stateful secret](../operations/deploys.md#secrets).
