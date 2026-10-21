# Local development

A local stack is six processes (Eureka, the three domain services, the Gateway and the Vite dev server), plus Postgres and MinIO in Docker. Live previews also need a local kind cluster. Everything else works without one.

If you only want to click around without any keys, skip all of this and use the [browser journey's stack](../practices/testing.md#the-browser-journey). It brings up the whole app with a scripted model and the Firebase Auth emulator.

## What you need

| Tool | Version | For |
|---|---|---|
| JDK | 25 | The backend. Use the bundled wrapper (`./mvnw`, `mvnw.cmd` on Windows), not a system Maven |
| Node.js + npm | 20+ | The frontend and the preview proxy |
| Docker | with Compose | Postgres and MinIO (`services.docker-compose.yml`) |
| kind + kubectl | recent | Only for [live previews](live-previews.md) |

| Account | Needed for | What to get |
|---|---|---|
| [Firebase](https://console.firebase.google.com/) | Sign-in (required) | A project with Authentication on, a service-account key for the backend, the web config for the frontend |
| An OpenAI-compatible provider | AI features (required) | An API key. The code defaults to OpenRouter; production uses Google's Gemini endpoint |
| [Stripe](https://dashboard.stripe.com/test) | Checkout only (optional) | Test keys, a webhook secret and two recurring prices (Pro, Business) |

Without Stripe, everything but checkout works. The Free plan and its limits are seeded either way.

## Getting it running

1. Fill in `.env`: [configuration](configuration.md)
2. Start the stack: [setup](setup.md)
3. Optional: [live previews on kind](live-previews.md), then [publishing locally](publishing.md)

Other pages here:

- [Troubleshooting](troubleshooting.md): errors you're likely to hit and what fixes them
- [Resetting local data](resetting-data.md): back to empty databases and storage
- [Working without AI calls](without-ai.md): the `stub-ai` profile, for UI work that shouldn't spend tokens
- Manual checks that no automated test covers: [preview](preview-checklist.md), [publishing](publish-checklist.md), [GitHub](github-checklist.md)

## Commands

On Windows use `mvnw.cmd` in place of `./mvnw`.

```bash
./mvnw -pl <module> spring-boot:run                            # run one service (and prove it boots)
./mvnw clean package                                           # build every jar
./mvnw test                                                    # every backend test
./mvnw -pl common-lib,<module> test -Dtest=ClassName#method    # one test, common-lib built from source
./mvnw -pl gateway-service test -Dtest=RoutingTableTest        # after any endpoint or route change
```

```bash
cd frontend
npm run dev                                   # dev server on :5173
npm test                                      # Vitest once (test:watch to watch)
npx tsc --noEmit -p tsconfig.app.json         # type-check
npm run lint && npm run build
```

```bash
docker compose -f services.docker-compose.yml up -d       # Postgres and MinIO
docker compose -f services.docker-compose.yml down -v     # deletes all local data
k8s/dev-port-forward.sh                                   # proxy + Redis out of kind (.ps1 on Windows)
kubectl -n singularity-ai get pods -L status,project-id   # the runner pool
```

## Health checks

Each service serves `/actuator/health` on a separate management port, `9404` by default (`MANAGEMENT_SERVER_PORT`), never on its main port. Nothing routes to that port, so it's unreachable through the Gateway or the tunnel. It answers without auth and only says `UP` or `DOWN`. Kubernetes probes hit it directly.

On one machine, every service wants `9404`, so the second one fails with "Port 9404 was already in use". [Setup](setup.md#2-start-the-backend) gives them `9401`–`9405`.

```bash
curl http://localhost:9402/actuator/health    # account-service with setup's ports
```
