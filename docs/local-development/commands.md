# Useful Commands

On Windows, use `mvnw.cmd` in place of `./mvnw`.

## Backend

| Command | Purpose |
|---|---|
| `./mvnw -pl <module> spring-boot:run` | Run one service (`discovery-service`, `gateway-service`, `account-service`, `workspace-service`, `intelligence-service`). This is how to prove a change actually boots |
| `./mvnw clean package` | Build every module's jar |
| `./mvnw test` | Run every module's tests |
| `./mvnw -pl common-lib,<module> test -Dtest=ClassName#method` | Run one test class or method, building `common-lib` from source |
| `./mvnw -pl gateway-service test -Dtest=RoutingTableTest` | Check the Gateway route table after any endpoint or route change |

## Frontend

Run from `frontend/`.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on port 5173 |
| `npm test` | Run the test suite once (`npm run test:watch` to watch) |
| `npx tsc --noEmit` | Type-check only |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Infrastructure

| Command | Purpose |
|---|---|
| `docker compose -f services.docker-compose.yml up -d` | Start PostgreSQL and MinIO |
| `docker compose -f services.docker-compose.yml down -v` | **Delete** all local data — read [resetting local data](resetting-data.md) first |
| `k8s/dev-port-forward.sh` / `.ps1` | Forward the preview proxy and Redis out of the local kind cluster |
| `kubectl -n vibecraft-ai get pods -L status,project-id` | Inspect the preview runner pool |
| `curl http://localhost:<management port>/actuator/health` | A service's health check ([health checks](health-checks.md)) |
