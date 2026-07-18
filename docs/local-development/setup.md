# First-Time Setup

```bash
# 1. Backend infra
docker compose -f services.docker-compose.yml up -d   # Postgres :9010, MinIO :9000/:9001, Mailpit :1025/:8025
cp .env.example .env                                    # fill in real values — see .env.example's comments

# 2. Backend services, in this order (each blocks its terminal — one terminal per service, or background them)
./mvnw -pl common-lib install                              # once per change to common-lib - see below
./mvnw -pl discovery-service spring-boot:run                # Eureka — the others register with it on boot
./mvnw -pl gateway-service spring-boot:run                   # the browser's single origin from here on
./mvnw -pl legacy-monolith spring-boot:run                    # still serves every route - see docs/migration/
./mvnw -pl account-service spring-boot:run                     # NOT yet reachable through Gateway - direct :8081 only
./mvnw -pl workspace-service spring-boot:run                    # NOT yet reachable through Gateway - direct :8082 only
./mvnw -pl intelligence-service spring-boot:run                  # NOT yet reachable through Gateway - direct :8083 only

# 3. Frontend, in a seventh terminal
cd frontend
npm install
cp .env.example .env.local                              # Firebase web config — see frontend/.env.example
npm run dev
```

Standing up all seven every time is more ceremony than the old two-process setup — that's the real, honest cost of this migration, not something to paper over. `.claude/launch.json` has them all pre-configured if you're driving this through Claude Code's preview tools instead of raw terminals. `common-lib` only needs re-installing when you actually change it, not on every normal startup — but if you're actively editing `common-lib` itself, note that `mvn compile` alone is **not** enough for a dependent service's `spring-boot:run` to see the change; see [Common Problems](troubleshooting.md#common-problems).

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Gateway (the browser's actual API origin) | http://localhost:8000 |
| Eureka dashboard | http://localhost:8761 |
| legacy-monolith (direct — bypasses Gateway, useful for isolating whether a bug is in the proxy or the app) | http://localhost:8080 |
| account-service (direct only — not yet routed through Gateway, see `docs/migration/`) | http://localhost:8081 |
| workspace-service (direct only — not yet routed through Gateway, see `docs/migration/`) | http://localhost:8082 |
| intelligence-service (direct only — not yet routed through Gateway, see `docs/migration/`) | http://localhost:8083 |
| Swagger UI / OpenAPI spec | `/swagger-ui.html` / `/v3/api-docs` on legacy-monolith directly — currently requires auth like any other endpoint, see `TODO.md` |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin123` by default) |
| Mailpit inbox (password-reset emails) | http://localhost:8025 |

**account-service, workspace-service, and intelligence-service each use their own Postgres database** (`vibecraft-account-db`, `vibecraft-workspace-db`, `vibecraft-intelligence-db`; same server, same credentials — no shared tables/FKs with each other or with `vibecraft-db`). `infra/postgres-init/` creates all three automatically on a brand-new `services.docker-compose.yml` volume; against this project's existing volume each was created once by hand (`CREATE DATABASE "vibecraft-intelligence-db"` via `docker exec pgvector-vibecraft psql -U user -d vibecraft-db`, same recipe for the other two) — you won't need to repeat that unless you wipe the volume.

**Running workspace-service's live-preview pipeline locally**: it points at the exact same `kind` namespace, Redis instance, and MinIO bucket `legacy-monolith` already uses (see [Running Live Previews Locally](live-previews.md#running-live-previews-locally)) — both services can safely run against them side by side, since `PreviewRouter`'s Redis keys are per-hostname, not per-service. The one thing that doesn't tolerate two owners: **only one process should hold the local port-forwards into the cluster's Redis/proxy pods at a time.** `workspace-service`'s `application.yaml` ships with `preview.port-forward.enabled: false` for exactly this reason — leave that to `legacy-monolith`'s own `PreviewPortForwarder` or the standalone `k8s/dev-port-forward` scripts while both services are up.

**Verifying Gateway is actually transparent**: `curl http://localhost:8080/api/plans` (direct) and `curl http://localhost:8000/api/plans` (through Gateway) should return byte-identical JSON. If they don't, something in the proxy path changed behavior it shouldn't have — see this migration's Reliability Strategy in the plan doc for why that's treated as a hard blocker, not a nitpick.

There is no seed script and no demo login — `data.sql` was deliberately deleted once real signup existed (see `docs/schema/`). Create an account through the frontend's normal sign-in flow (Firebase) or the legacy `POST /api/auth/signup` endpoint.
