# Development

## Quickest start

Nothing to configure. This brings up the whole app on kind with a scripted model and the Firebase Auth emulator:

```bash
./mvnw -DskipTests package
e2e/stack.sh up --context kind-<cluster>      # ~3 min the first time
e2e/stack.sh down --context kind-<cluster>
```

## Full setup

**You need:** JDK 25, Node 20+, Docker, a Firebase project, and a key for an OpenAI-compatible model API. kind and kubectl are only needed for live previews. Stripe is optional.

```bash
docker compose -f services.docker-compose.yml up -d    # Postgres :9010, MinIO :9000 (console :9001)
cp .env.example .env                                   # backend secrets
cp frontend/.env.example frontend/.env.local           # Firebase web config
./mvnw -pl common-lib install
```

Start each service in its own terminal, Eureka first and the Gateway last:

| Service | Command | Port |
|---|---|---|
| discovery | `MANAGEMENT_SERVER_PORT=9401 ./mvnw -pl discovery-service spring-boot:run` | 8761 |
| account | `MANAGEMENT_SERVER_PORT=9402 ./mvnw -pl account-service spring-boot:run` | 8081 |
| workspace | `MANAGEMENT_SERVER_PORT=9403 ./mvnw -pl workspace-service spring-boot:run` | 8082 |
| intelligence | `MANAGEMENT_SERVER_PORT=9404 ./mvnw -pl intelligence-service spring-boot:run` | 8083 |
| gateway | `MANAGEMENT_SERVER_PORT=9405 ./mvnw -pl gateway-service spring-boot:run` | 8000 |
| frontend | `cd frontend && npm install && npm run dev` | 5173 |

Open http://localhost:5173 and sign up. On first start, Flyway creates the schemas, the plans are seeded, and the starter template is uploaded to MinIO.

Every service defaults to management port 9404, so each one needs its own when they share a machine. On Windows, use `mvnw.cmd` and set the port with `$env:MANAGEMENT_SERVER_PORT=9401`.

## Configuration

Backend values go in `.env` at the repo root. None of them have defaults, so a missing one stops the service from starting.

| Variable | Needed for |
|---|---|
| `DB_USERNAME`, `DB_PASSWORD` | Postgres |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS_PATH` | Sign-in. Keep the key file outside the repo |
| `OPENROUTER_API_KEY` | All AI calls (any OpenAI-compatible endpoint) |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | File storage |
| `INTERNAL_SERVICE_SHARED_SECRET` | Service-to-service calls. Any long random string, the same for every service |
| `PREVIEW_ACCESS_TOKEN_SECRET` | Previews. Must match the proxy's secret |
| `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Checkout only |
| `GITHUB_ENABLED`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN_KEY` | GitHub push only |

The frontend needs `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`.

To work without spending tokens, run intelligence-service with the scripted model:

```bash
./mvnw -pl common-lib,intelligence-service compile spring-boot:run -Dspring-boot.run.profiles=stub-ai
```

## Live previews on kind

```bash
kind create cluster --name singularity --config k8s/kind-config.yaml
kubectl apply -f k8s/infra.yml               # namespace, Redis, quotas
kubectl apply -f k8s/minio-hostbridge.yml    # points the cluster at your local MinIO
kubectl create secret generic minio-runner-credentials -n singularity-ai \
  --from-literal=host-uri='http://minioadmin:minioadmin123@minio-service:9000'
kubectl create secret generic preview-access-token -n singularity-ai \
  --from-literal=secret='<PREVIEW_ACCESS_TOKEN_SECRET>'
kubectl apply -f k8s/runner-pods.yml
kubectl apply -f k8s/singularity-proxy.yml
k8s/dev-port-forward.sh                      # proxy + Redis out to localhost (.ps1 on Windows)
```

After changing `proxy/`, run `docker build -t singularity-proxy:latest proxy`, then `kind load docker-image singularity-proxy:latest --name singularity`, then restart the proxy deployment.

## Tests

```bash
./mvnw verify                                                 # backend + coverage floors (needs Docker)
./mvnw -pl common-lib,<service> test -Dtest=Class#method      # one test
./mvnw -pl gateway-service test -Dtest=RoutingTableTest       # after any route change
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm test && npm run build
cd proxy && node --test
```

| Suite | Runs | Needs |
|---|---|---|
| Backend unit + slice tests | `./mvnw test` | Docker for one Testcontainers test |
| Real preview / publish | `PreviewPipelineIT`, `PublishPipelineIT` after `k8s/preview-test-cluster.sh --context kind-singularity --seed` | kind |
| Browser journeys | `e2e/stack.sh up` then `cd e2e && npm test` | kind, Playwright |
| Build benchmark | `BuildBenchmarkIT` (spends tokens, only on request) | A model key |

Always build as a reactor with `-pl common-lib,<service>`. A lone `-pl <service>` uses whatever `common-lib` jar is in `~/.m2`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Time-zone error on the first Postgres connection (Windows) | Already handled in `main()`. For a Spring test, call `WindowsTimezoneWorkaround.apply()` |
| Flyway checksum mismatch, or a missing column | Add a new migration. Never edit an applied one |
| `NoClassDefFoundError` for a new `common-lib` class | A stale jar. Build with `-pl common-lib,<service>` |
| A service starts with blank secrets | `.env` has to be at the repo root |
| "Port 9404 already in use" | Give each service its own `MANAGEMENT_SERVER_PORT` |
| `403` on a write | Missing or stale `X-XSRF-TOKEN` |
| Every internal call is `401` | A `@FeignClient(path=...)` prefix hides `/internal/` from the interceptor |
| A build answers `409` | A turn is already running for that project |
| A preview looks wrong | Read `/tmp/dev.log` in the runner pod first |

Logs: `kubectl -n singularity-ai logs -l app=runner -c runner -f`.
