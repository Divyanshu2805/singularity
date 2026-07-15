# Useful Commands

| Command | Purpose |
|---|---|
| `./mvnw spring-boot:run` | Run the backend — goes through `main()`, unlike `test`, so it's the way to verify a change actually boots |
| `./mvnw clean package` | Build the jar |
| `./mvnw test -Dtest=ClassName#methodName` | Run one test method |
| `npm run build` | Frontend production build |
| `npm run lint` | Frontend ESLint |
| `docker compose -f services.docker-compose.yml down -v` | Wipe local Postgres/MinIO/Mailpit data entirely |
| `k8s/dev-port-forward.sh` / `.ps1` | Forward the preview proxy + Redis out of a local `kind` cluster |
