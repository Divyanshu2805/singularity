# Phase 1: Repo readiness

The code needs about a day of fixes before it can run anywhere but a developer laptop. Each item below came from reading the repo on 2026-08-24.

- [x] **Land or park the in-progress revision work.** About 50 changed or new files, including the `V4__revision_manifests.sql` migration, sat uncommitted on 2026-08-24. Landed as 12 separate commits by concern, pushed and green on CI, plus a follow-up fix once the revision endpoints' gateway path was found broken and their cross-tenant restore check was found missing (commit `d41d355`).
- [x] **Move the starter template into the repo.** Exported the real 15-file template (54 KB, no `node_modules`/lockfile) from local MinIO into `workspace-service/src/main/resources/starter-templates/react-vite-tailwind-daisyui-starter/`, checked in with a `MANIFEST.txt` file list. A new `StarterTemplateSeeder` (`ApplicationRunner`, matching `StorageBucketInitializer`'s existing idempotent-bootstrap pattern) uploads it from the jar's classpath into MinIO at startup — no separate Job needed. Verified live against a genuinely fresh, empty MinIO container: boots, creates the bucket, uploads all 15 files byte-identical to the source; a second boot against the now-populated instance re-uploads nothing.
  - **Found and fixed in the same pass:** booting workspace-service for this check surfaced a real Spring bean-wiring cycle in the already-committed revision code (`RevisionPublisherImpl → RevisionBuildValidator → RevisionServiceImpl → RevisionPublisher`) that made the service fail to boot at all — invisible to `./mvnw clean package` since no test here boots a real context. Fixed by extracting the shared method into a new leaf component, `RevisionSnapshotReader`; see `CLAUDE.md`'s gotchas table. Re-verified live boot after the fix.
- [x] **Preview proxy Service:** changed `type: LoadBalancer` to `ClusterIP` in `k8s/vibecraft-proxy.yml`. It was always pending forever on kind anyway (no load balancer to provision) and reached locally through `kubectl port-forward`, which targets a Service's ClusterIP regardless of `type` — so nothing changes for local dev, and a real cluster no longer gets an unauthenticated public IP the Cloudflare tunnel was meant to be the only entry point past.
- [ ] **MinIO:** replace the `minio-service` ExternalName that points at `host.docker.internal` (the developer's laptop) with a real in-cluster MinIO.
- [ ] **Preview pods' MinIO login:** use a read-only MinIO user instead of the admin credentials they get today.
- [ ] **Preview network rule:** today it allows any address on ports 80/443/9000. That includes other pods and the cloud metadata address `169.254.169.254`. Exclude both, and allow MinIO explicitly.
- [x] **Stream keep-alive:** added `SseHeartbeat` (`intelligence-service`), a shared utility both `ChatController` and `CodeInsightController` now wrap every SSE stream in — a bare `: keep-alive` comment line every 20s of silence, via `Flux#publish` so the underlying source (a live, billable AI generation) is subscribed to exactly once, not twice just to watch for its own completion. Proven with `StepVerifier.withVirtualTime`: heartbeats appear during an idle stretch, stop the instant the source completes, and the single-subscription property holds.
- [x] **Health checks:** added Spring Boot Actuator's `/actuator/health` to all 5 services, on a separate `management.server.port` (default 9404) rather than a Gateway route — verified live that it's reachable with no auth on that port and unreachable on the service's own port, with only `health` exposed (no env/beans). See `docs/local-development/health-checks.md`'s "Health Checks" section.
- [x] **Preview boot timeout:** raised `preview.boot-timeout` from 2 to 4 minutes in `workspace-service/src/main/resources/application.yaml`, because installs are slower on 2 cores. No test hardcodes the old default — every existing test builds `PreviewProperties` with its own literal `Duration`, independent of this file.
- [ ] **Production settings, as environment variables only (no code change):**

| Setting | Value on the server |
| --- | --- |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/vibecraft-<service>-db` |
| `SPRING_DATA_REDIS_HOST` | `redis-service.vibecraft-ai` |
| `MINIO_URL` | `http://minio:9000` |
| `CLIENT_URL` | `https://app.divyanshuagrahari.dev` |
| `EUREKA_SERVER_URL` | `http://discovery-service:8761/eureka/` |
| `PREVIEW_PUBLIC_SCHEME`, `PREVIEW_PUBLIC_DOMAIN`, `PREVIEW_PUBLIC_PORT` | `https`, `divyanshuagrahari.dev`, `443` |
| `SPRING_JPA_SHOW_SQL` | `false` |
| `FIREBASE_CREDENTIALS_PATH` | Mounted secret file, e.g. `/var/secrets/firebase/sa.json` |
| `SPRING_AI_OPENAI_CHAT_OPTIONS_MODEL` | Optional: a cheaper model than `x-ai/grok-4.5` for the demo |
