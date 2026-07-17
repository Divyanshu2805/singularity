# Phase 0 — Scaffolding (complete)

No domain code moved. What changed:

| Before | After |
|---|---|
| Root `pom.xml` was the single Spring Boot app's own POM | Root `pom.xml` is now a reactor parent (`packaging=pom`); the original app's POM content lives in `legacy-monolith/pom.xml` |
| `src/main/java/com/java/vibecraft/...` | `legacy-monolith/src/main/java/com/java/vibecraft/...` — identical package, identical code, just under a new module root. `git mv`, not rewritten. |
| Browser → backend directly (`:8080`) | Browser → `gateway-service` (`:8000`, reactive Spring Cloud Gateway) → `legacy-monolith` (`:8080`), transparent passthrough — see `gateway-service/src/main/resources/application.yaml`'s single catch-all route |
| No service registry | `discovery-service` (`:8761`, Eureka) — `gateway-service` registers with it now; `legacy-monolith` will register starting Phase 1, when it first needs to *discover* another service (`account-service`) rather than just being routed to |
| No shared library | `common-lib` exists (internal-JWT issue/verify, `JwtAuthFilter`, `InternalServiceAuthFilter`, `FeignClientInterceptor`, the `ApiError`/exception taxonomy, `ClockConfig`/`AsyncConfig`/`Hashing`) but **nothing depends on it yet** — it's built ahead of need so Phase 1 can wire it in without also writing it under time pressure. Fresh code, not moved from `legacy-monolith` (moving it would have meant touching the monolith in a phase whose whole point was not touching it). |

**Verification performed**: full reactor compile (`./mvnw clean compile`, all 5 modules); all three runnable services (`discovery-service`, `gateway-service`, `legacy-monolith`) booted against the real local Postgres/MinIO; `GET /api/plans` confirmed byte-identical whether hit directly on `:8080` or through Gateway on `:8000`; the frontend (pointed at Gateway via `vite.config.ts`'s `API_PROXY_TARGET` default) loaded and successfully called `/api/plans` through the full Vite-proxy → Gateway → monolith chain with no code changes beyond that one default.

**Known fragile point found and fixed during this phase**: `spring-cloud-dependencies:2025.1.2` manages `io.fabric8:kubernetes-client-api` at a version that doesn't match the `kubernetes-client:6.13.4` pinned for the live-preview pipeline — see `docs/local-development/troubleshooting.md`'s troubleshooting table for the fix (importing `kubernetes-client-bom` ahead of `spring-cloud-dependencies` in the root POM) and why it's a runtime `NoClassDefFoundError`, not a compile error.
