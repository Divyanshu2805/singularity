# First-Time Setup

```bash
# 1. Backend infra
docker compose -f services.docker-compose.yml up -d   # Postgres :9010, MinIO :9000/:9001, Mailpit :1025/:8025
cp .env.example .env                                    # fill in real values — see .env.example's comments
./mvnw spring-boot:run                                  # mvnw.cmd on Windows

# 2. Frontend, in a second terminal
cd frontend
npm install
cp .env.example .env.local                              # Firebase web config — see frontend/.env.example
npm run dev
```

| Service | URL |
|---|---|
| Backend API | http://localhost:8080 |
| Frontend | http://localhost:5173 |
| Swagger UI / OpenAPI spec | `/swagger-ui.html` / `/v3/api-docs` — currently requires auth like any other endpoint, see `TODO.md` |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin123` by default) |
| Mailpit inbox (password-reset emails) | http://localhost:8025 |

There is no seed script and no demo login — `data.sql` was deliberately deleted once real signup existed (see `docs/schema/`). Create an account through the frontend's normal sign-in flow (Firebase) or the legacy `POST /api/auth/signup` endpoint.
