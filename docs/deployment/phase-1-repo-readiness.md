# Phase 1: Repo readiness

The code needs about a day of fixes before it can run anywhere but a developer laptop. Each item below came from reading the repo on 2026-08-24.

- [x] **Land or park the in-progress revision work.** About 50 changed or new files, including the `V4__revision_manifests.sql` migration, sat uncommitted on 2026-08-24. Landed as 12 separate commits by concern, pushed and green on CI, plus a follow-up fix once the revision endpoints' gateway path was found broken and their cross-tenant restore check was found missing (commit `d41d355`).
- [ ] **Move the starter template into the repo.** `starter-projects/react-vite-tailwind-daisyui-starter/` exists only in the local MinIO. Without it, a fresh server can't create projects. It goes under `deploy/seed/`, and a one-time Job loads it.
- [ ] **Preview proxy Service:** change `type: LoadBalancer` to `ClusterIP` in `k8s/vibecraft-proxy.yml`. The tunnel reaches it privately.
- [ ] **MinIO:** replace the `minio-service` ExternalName that points at `host.docker.internal` (the developer's laptop) with a real in-cluster MinIO.
- [ ] **Preview pods' MinIO login:** use a read-only MinIO user instead of the admin credentials they get today.
- [ ] **Preview network rule:** today it allows any address on ports 80/443/9000. That includes other pods and the cloud metadata address `169.254.169.254`. Exclude both, and allow MinIO explicitly.
- [ ] **Stream keep-alive:** chat and code-insight streams send nothing while the model thinks. Cloudflare closes a connection after 100 seconds of silence. Add a keep-alive comment every ~20 seconds.
- [ ] **Health checks:** add Spring Boot Actuator's liveness/readiness endpoints to each service, permitted in each security chain and never routed through the Gateway.
- [ ] **Preview boot timeout:** raise `preview.boot-timeout` from 2 to 4 minutes, because installs are slower on 2 cores.
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
