# Configuration and Secrets

All production configuration lives in the GitHub **`production` environment**, restricted to deploys from `main`. On every deploy, `deploy/scripts/apply-secrets.sh` turns its secrets into Kubernetes Secrets, and the workflow passes its variables into image builds and manifests. Nothing is hand-edited on the server.

Credentials and private hostnames — the tailnet hostname, the tunnel's credentials, account-scoped endpoints — are kept out of the repository and live only in this environment. The tunnel's id and public hostnames are not secret and appear in `deploy/k8s/overlays/oracle/cloudflared-config.yaml`.

## Secrets

| Name | Holds |
|---|---|
| `DB_PASSWORD` | The Postgres password |
| `MINIO_ROOT_PASSWORD` | The MinIO admin password |
| `MINIO_RUNNER_SECRET` | The password of the read-only MinIO user the preview pods use |
| `MINIO_PUBLISHED_SECRET` | The password of the read-only MinIO user the preview proxy serves published apps with - a different value from the runner's, because that one is in every runner pod next to project code |
| `INTERNAL_SERVICE_SHARED_SECRET` | The internal-API secret — a new random value, never the local one |
| `PREVIEW_ACCESS_TOKEN_SECRET` | Signs preview access tokens — a different random value |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The Firebase Admin service-account key file's contents |
| `OPENROUTER_API_KEY` | A Gemini API key used only by the deployment, with a spending cap. The name is historical: the deployment calls Google's API directly (below), and whatever this holds is sent to that endpoint |
| `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Stripe keys and price ids |
| `CLOUDFLARE_TUNNEL_CREDENTIALS` | The tunnel's credentials JSON |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` | The backup bucket's token and S3 endpoint (`https://<account id>.r2.cloudflarestorage.com`) |
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | A Tailscale OAuth client (scope **Auth Keys: Write**, tag `tag:ci`) that lets CI join the tailnet |
| `KUBE_API_SERVER` | The k3s API's URL over Tailscale |
| `KUBE_DEPLOYER_TOKEN` | The namespace-scoped `deployer` service-account token |
| `KUBE_CA_CERT` | Optional. The cluster's CA certificate, base64 of the PEM (`base64 -w0 /var/lib/rancher/k3s/server/tls/server-ca.crt` on the server). With it the deploy checks the API server's certificate; without it the check is skipped and the run says so. The certificate must name the address in `KUBE_API_SERVER` - start k3s with `--tls-san <tailscale hostname>` first, or every deploy fails at the first `kubectl` call |

## Variables

These are public values, safe to show.

| Name | Holds |
|---|---|
| `APP_DOMAIN` | The app's hostname, e.g. `singularity.divyanshuagrahari.dev` |
| `PREVIEW_ROOT_DOMAIN` | The parent domain of preview hostnames, e.g. `divyanshuagrahari.dev` |
| `FIREBASE_PROJECT_ID` | The Firebase project id |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | The Firebase web config baked into the frontend |

## Settings the services receive

Non-secret settings are set as environment variables or `app-config` entries in the manifests:

| Setting | Production value |
|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/singularity-<service>-db` |
| `SPRING_DATA_REDIS_HOST` | `redis-service.singularity-ai` |
| `PREVIEW_NAMESPACE` | `singularity-ai` — the namespace workspace-service claims runner pods in. Set explicitly so it can never silently differ from the manifests' namespace; the `application.yaml` default is only the local-dev value |
| `MINIO_URL` | `http://minio-service:9000` |
| `EUREKA_SERVER_URL` | `http://discovery-service:8761/eureka/` |
| `CLIENT_URL` | `https://<app domain>` |
| `PUBLISHING_PUBLIC_SCHEME`, `PUBLISHING_PUBLIC_DOMAIN`, `PUBLISHING_PUBLIC_PORT` | Optional. Where published apps' links point; they follow the `PREVIEW_PUBLIC_*` values when unset. Set `PUBLISHING_PUBLIC_DOMAIN` (and the proxy's `PUBLISHED_DOMAIN`) to move published apps to a domain of their own |
| `PREVIEW_PORT_FORWARD_ENABLED` | `false` — the local-dev default opens port-forwards into a kind cluster; deployed, Redis and the proxy are reached directly |
| `PREVIEW_KUBE_CONTEXT` | blank — use the pod's own service account. The local-dev default names the kind cluster's kubeconfig context |
| `PREVIEW_PUBLIC_SCHEME`, `PREVIEW_PUBLIC_DOMAIN`, `PREVIEW_PUBLIC_PORT` | `https`, the preview root domain, `443` |
| `FIREBASE_CREDENTIALS_PATH` | `/var/secrets/firebase/sa.json`, mounted from the `firebase-service-account` Secret |
| `SPRING_JPA_SHOW_SQL` | `false` |
| `SPRING_AI_OPENAI_BASE_URL`, `SPRING_AI_OPENAI_CHAT_COMPLETIONS_PATH` | From `app-config`'s `ai-base-url` and `ai-completions-path`: Google's OpenAI-compatible endpoint, not the code default (OpenRouter) |
| `SPRING_AI_OPENAI_CHAT_OPTIONS_MODEL` | From `app-config`'s `ai-model` key (`gemini-3.8-flash`) — the model for build and repair turns |
| `AI_CALLS_BUILD_REASONINGEFFORT`, `AI_CALLS_REPAIR_REASONINGEFFORT` | From `ai-build-reasoning-effort` (`low`) |
| `AI_CALLS_INTERVIEW_MODEL`, `AI_CALLS_LESSON_MODEL`, `AI_CALLS_EXPLAIN_MODEL`, `AI_CALLS_SUGGEST_MODEL` | From `ai-light-model` (`gemini-3.5-flash-lite`). These are the models and settings the [build benchmark](../practices/build-benchmark-results.md) was measured on; `AiCallPropertiesEnvironmentTest` holds the variable names to what the service reads |

The frontend image is built with `VITE_CSP_FRAME_ORIGINS=https://*.<preview root domain>` and `VITE_PAYMENTS_TEST_MODE=true` while Stripe runs in test mode.

## Adding a secret

1. Add it to the `production` environment.
2. Add it to the required-variable list and an `apply` call in `deploy/scripts/apply-secrets.sh`.
3. Pass it in the `deploy` job's `env:` in `ci.yml`.
4. Reference it from the manifest that needs it.

Rotating the Postgres or MinIO password needs care — see [rotating a stateful secret](../operations/deploys.md#secrets).
