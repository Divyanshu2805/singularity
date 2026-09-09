# Tech Stack

Versions are the ones pinned in `pom.xml`, `frontend/package.json` and the Dockerfiles.

## Backend

| Technology | Version | Used for |
|---|---|---|
| Java | 25 | Every backend service |
| Spring Boot | 4.1 | Web MVC, Data JPA, Security, Validation, Actuator |
| Spring Cloud | 2025.1 | Gateway (reactive, so SSE streams aren't buffered), Eureka discovery, OpenFeign, load balancing |
| Spring AI | 2.0 (milestone) | The `ChatClient`, streaming, tools and advisors — pointed at OpenRouter's OpenAI-compatible API |
| PostgreSQL | 18 | One database per service |
| Flyway | via `spring-boot-starter-flyway` | Owns every schema; Hibernate only validates |
| Lombok, MapStruct | MapStruct 1.6 | Boilerplate and entity ↔ DTO mapping |
| Firebase Admin SDK | 9.10 | Verifying ID tokens and session cookies — the only sign-in method |
| Stripe Java SDK | 31.1 | Subscriptions, checkout, the customer portal, webhooks |
| MinIO Java SDK | 8.6 | Project file storage (S3-compatible) |
| fabric8 `kubernetes-client` | 6.13.4 | Claiming runner pods, exec, and file upload for live previews |
| Spring Data Redis | — | Preview hostname routes |
| Maven | Wrapper (`mvnw`) | A multi-module reactor build |

## Frontend

| Technology | Version | Used for |
|---|---|---|
| React + TypeScript | 18.3 / 5.8 | The single-page app |
| Vite | 5.4 | Dev server (with the `/api` proxy) and production build |
| Tailwind CSS + shadcn/ui | 3.4 | Styling and accessible primitives (Radix UI) |
| TanStack Query | 5 | Server state and caching |
| React Router | 6 | Routing |
| CodeMirror | 6 | The code editor and diff view |
| Firebase JS SDK | 12 | Sign-in |
| Recharts | 2 | Usage charts |
| Vitest + Testing Library | 3 | Tests |

## Preview proxy

A small Node.js service (`proxy/`) using `http-proxy` and `ioredis`, tested with Node's built-in `node:test`.

## Infrastructure

| Technology | Used for |
|---|---|
| Docker Compose | Local PostgreSQL and MinIO |
| Kubernetes — kind locally, k3s in production | Live-preview runner pods; the whole stack in production |
| Kustomize | Production manifests with per-environment overlays |
| Redis | Preview routing |
| GitHub Actions + GHCR | CI/CD and container images |
| Cloudflare (DNS, Tunnel, R2) | HTTPS ingress without open ports, and off-machine backups |
| Tailscale | Private access for administration and deploys |
