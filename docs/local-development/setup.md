# First-Time Setup

```bash
# 1. Backend infra
docker compose -f services.docker-compose.yml up -d   # Postgres :9010, MinIO :9000/:9001, Mailpit :1025/:8025
cp .env.example .env                                    # fill in real values — see .env.example's comments

# 2. Backend services, in this order (each blocks its terminal — one terminal per service, or background them)
./mvnw -pl common-lib install                              # once per change to common-lib - see below
./mvnw -pl discovery-service spring-boot:run                # Eureka — the others register with it on boot
./mvnw -pl account-service spring-boot:run                    # :8081
./mvnw -pl workspace-service spring-boot:run                   # :8082
./mvnw -pl intelligence-service spring-boot:run                 # :8083
./mvnw -pl gateway-service spring-boot:run                       # LAST: the browser's single origin; resolves the three services from Eureka

# 3. Frontend, in a sixth terminal
cd frontend
npm install
cp .env.example .env.local                              # Firebase web config — see frontend/.env.example
npm run dev
```

Start the Gateway after the three services so they're already registered when its first request arrives. `.claude/launch.json` has every process pre-configured if you're driving this through Claude Code's preview tools instead of raw terminals — **but that tool caps a worktree at 5 running servers**, and the backend alone needs 5, so run the frontend (`npm run dev`) from your own terminal. `common-lib` only needs re-installing when you actually change it, not on every normal startup — but if you're actively editing `common-lib` itself, note that `mvn compile` alone is **not** enough for a dependent service's `spring-boot:run` to see the change; see [Common Problems](troubleshooting.md#common-problems).

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Gateway (the browser's actual API origin; routes each URL to the owning service) | http://localhost:8000 |
| Eureka dashboard | http://localhost:8761 |
| account-service (also reachable directly — useful for isolating a proxy bug from an app bug) | http://localhost:8081 |
| workspace-service (same) | http://localhost:8082 |
| intelligence-service (same) | http://localhost:8083 |
| legacy-monolith — **off**; only started for a rollback or to browse its Swagger UI (`/swagger-ui.html`, `/v3/api-docs` — the new services don't ship springdoc) | http://localhost:8080 |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin123` by default) |
| Mailpit inbox (password-reset emails) | http://localhost:8025 |

**account-service, workspace-service, and intelligence-service each use their own Postgres database** (`vibecraft-account-db`, `vibecraft-workspace-db`, `vibecraft-intelligence-db`; same server, same credentials — no shared tables/FKs with each other or with `vibecraft-db`). `infra/postgres-init/` creates all three automatically on a brand-new `services.docker-compose.yml` volume; against this project's existing volume each was created once by hand (`CREATE DATABASE "vibecraft-intelligence-db"` via `docker exec pgvector-vibecraft psql -U user -d vibecraft-db`, same recipe for the other two) — you won't need to repeat that unless you wipe the volume.

**Loading the old monolith's data into those databases** (a one-off, already done for this project's dev database at the Phase 4 cutover): `bash infra/data-migration/legacy-to-services.sh` is a dry-run that copies every `vibecraft-db` table into its service's database inside a transaction, reports row counts and dangling ids, and **rolls back**; add `--execute` to commit. It refuses to run while anything is connected to any of the four databases, and `--execute` **truncates the service databases first** — never run it against services that have taken real writes. Details, including the timestamp and sequence handling: `docs/migration/phase-4-cutover.md`, Phase 4.

**Running workspace-service's live-preview pipeline locally**: it points at the same `kind` namespace, Redis instance, and MinIO bucket `legacy-monolith` always used (see [Running Live Previews Locally](live-previews.md#running-live-previews-locally)), so existing projects' files and preview routes carry over untouched. `workspace-service`'s `application.yaml` ships with `preview.port-forward.enabled: false`, exactly as `legacy-monolith`'s did — so the local port-forwards into the cluster's Redis and preview-proxy pods come from the standalone `k8s/dev-port-forward.ps1` (or `.sh`) script, left running in its own terminal. Only one process should hold those forwards at a time. **History worth knowing (pre-existing, not from the split): starting a preview used to fail with a 503.** `kubernetes-client 6.13.4` can't serialize a Pod it fetched back under Boot 4.1.0's Jackson 2.21.4 (`NullPointerException: "keySerializer" is null`), and it fails identically in `legacy-monolith`. `PreviewRunnerPool.claim()` now sends a minimal JSON merge patch (the two labels, the annotation and the listed `resourceVersion` as the precondition) instead of an `update` of the fetched Pod, so nothing read from the cluster is ever serialized. Keep it that way: any new code that writes an object it just read back with this client should patch, not `update`. Details: `docs/migration/phase-4-cutover.md`, Phase 4, "Found after the cutover and fixed".

**Verifying the Gateway is actually transparent**: `curl http://localhost:8081/api/plans` (account-service directly) and `curl http://localhost:8000/api/plans` (through the Gateway) should return byte-identical JSON. If they don't, something in the proxy path changed behavior it shouldn't have. To check *which* service owns a URL, don't guess — `gateway-service`'s `RoutingTableTest` (`./mvnw.cmd -pl gateway-service test -Dtest=RoutingTableTest`) evaluates the real route table against every endpoint. A `500` from the Gateway on a path no service owns (`/`, `/nope`) is expected while `legacy-monolith` is off: it's the Gateway's connection-refused to the fallback route.

**Rolling back to the monolith** (until it's deleted): stop the Gateway, start `legacy-monolith` (`./mvnw -pl legacy-monolith spring-boot:run`), restart the Gateway with `--spring.profiles.active=legacy-routing`. Anything written to the new services' databases since the cutover is not copied back — see `docs/migration/phase-4-cutover.md`, Phase 4.

There is no seed script and no demo login — `data.sql` was deliberately deleted once real signup existed (see `docs/schema/`). Create an account through the frontend's normal sign-in flow (Firebase) or the legacy `POST /api/auth/signup` endpoint.
