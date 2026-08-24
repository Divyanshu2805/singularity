# Health Checks

Every service (`discovery`, `gateway`, `account`, `workspace`, `intelligence`) exposes Spring Boot Actuator's `/actuator/health` on a **separate port**, `management.server.port` (default `9404`, override with `MANAGEMENT_SERVER_PORT`) — never on the service's own `server.port`. This is deliberate, not an oversight:

- **It's structurally unreachable through the Gateway or any Service a load balancer/tunnel forwards to**, since it never shares a port with the service's real traffic. `gateway-service`'s route table (`RoutingTableTest`) never needs an entry for it, and the "no catch-all — an unowned path 404s" invariant stays true for every path that table actually governs.
- **It answers with no authentication**, by Spring Boot's own default for a separate management port — confirmed live: hitting `/actuator/health` on the service's main port 401s/404s, hitting it on `9404` returns `{"status":"UP"}` with nothing else exposed (`management.endpoints.web.exposure.include: health`, `show-details: never`, so no DB/Redis/MinIO connection internals leak). `ServiceSecurityConfig`/account's `WebSecurityConfig` also `permitAll` it as defense in depth, for the day someone collapses the ports back together.
- Locally, hit it directly: `curl http://localhost:9404/actuator/health` (or `:9404` on whichever service you started — they all default to the same management port since each runs as its own process on its own machine in production, but two started side by side locally on one machine will collide on `9404`; override `MANAGEMENT_SERVER_PORT` per service if you need more than one running actuator at once).

In Kubernetes, the liveness/readiness probes in `k8s/`'s Deployments target `9404` directly on the pod, not through any Service.
