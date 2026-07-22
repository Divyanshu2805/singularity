# Useful Commands

| Command | Purpose |
|---|---|
| `./mvnw -pl <module> spring-boot:run` | Run one service (`discovery-service`, `gateway-service`, `account-service`, `workspace-service`, `intelligence-service`) — goes through `main()`, unlike `test`, so it's the way to verify a change actually boots. Reactor-wide, so always target a module explicitly; a bare `./mvnw spring-boot:run` at the root fails since the parent POM has no main class |
| `./mvnw clean package` | Build every module's jar |
| `./mvnw -pl <module> test -Dtest=ClassName#methodName` | Run one test method in one module |
| `npm run build` | Frontend production build |
| `npm run lint` | Frontend ESLint |
| `docker compose -f services.docker-compose.yml down -v` | Wipe local Postgres/MinIO/Mailpit data entirely |
| `k8s/dev-port-forward.sh` / `.ps1` | Forward the preview proxy + Redis out of a local `kind` cluster |
