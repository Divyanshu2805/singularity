# First-Time Setup

Assumes the [prerequisites](prerequisites.md) are installed and [`.env`](configuration.md) is filled in.

## 1. Start PostgreSQL and MinIO

```bash
docker compose -f services.docker-compose.yml up -d
```

This starts PostgreSQL on port `9010` and MinIO on `9000` (API) and `9001` (console). On a brand-new volume, `infra/postgres-init/` creates the three service databases.

## 2. Start the backend

Each command blocks its terminal, so use one terminal per service (or run them in the background).

```bash
./mvnw -pl common-lib install                                                # once, and whenever common-lib changes
MANAGEMENT_SERVER_PORT=9401 ./mvnw -pl discovery-service spring-boot:run      # Eureka :8761 — start first
MANAGEMENT_SERVER_PORT=9402 ./mvnw -pl account-service spring-boot:run        # :8081
MANAGEMENT_SERVER_PORT=9403 ./mvnw -pl workspace-service spring-boot:run      # :8082
MANAGEMENT_SERVER_PORT=9404 ./mvnw -pl intelligence-service spring-boot:run   # :8083
MANAGEMENT_SERVER_PORT=9405 ./mvnw -pl gateway-service spring-boot:run        # :8000 — start last
```

Every service's health endpoint defaults to management port `9404`, so on one machine each needs its own `MANAGEMENT_SERVER_PORT` — otherwise the second service to start fails with "Port 9404 was already in use". On Windows PowerShell, set it with `$env:MANAGEMENT_SERVER_PORT=9401; .\mvnw.cmd -pl discovery-service spring-boot:run`.

Start the Gateway last so the three services are already registered with Eureka when its first request arrives.

On first start, each service's Flyway migrations create its schema; account-service seeds the Free, Pro and Business plans; and workspace-service creates its MinIO buckets and uploads the starter template.

> A bare `./mvnw spring-boot:run` at the repository root fails: the root `pom.xml` is an aggregator with no main class. Always pick a module with `-pl`.

## 3. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in the Firebase web config
npm run dev
```

## 4. Sign in

Open <http://localhost:5173> and create an account through the normal sign-in flow. There is no seed data and no demo login.

## Local URLs

| Process | URL |
|---|---|
| Frontend | <http://localhost:5173> |
| Gateway (the browser's API origin) | <http://localhost:8000> |
| Eureka dashboard | <http://localhost:8761> |
| account-service (direct) | <http://localhost:8081> |
| workspace-service (direct) | <http://localhost:8082> |
| intelligence-service (direct) | <http://localhost:8083> |
| MinIO console | <http://localhost:9001> (`minioadmin` / `minioadmin123` by default) |

Calling a service directly is useful for telling a routing problem from an application problem: `curl http://localhost:8081/api/plans` and `curl http://localhost:8000/api/plans` should return identical JSON. A path no service owns is a `404` from the Gateway itself.

## Running two stacks at once

Every process binds a fixed default port, so a second checkout's stack collides with the first. To run both, give the second stack its own ports with a small properties file per service (`server.port=180xx` and `eureka.client.service-url.defaultZone=http://localhost:18761/eureka/`), passed with `-Dspring-boot.run.jvmArguments=-Dspring.config.additional-location=file:///path/to/file.properties`. The stacks can share Postgres, MinIO and Redis.

Next: [live previews](live-previews.md) (optional).
