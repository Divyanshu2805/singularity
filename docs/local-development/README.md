# Local Development

**This backend has been migrated from a monolith to microservices** (see `docs/migration/` for what moved where and why). The frontend talks to a `gateway-service` (a transparent reverse proxy), which routes each URL to the service that owns it, resolved through a `discovery-service` (Eureka): `account-service` (User/Plan/Subscription/billing, auth), `workspace-service` (Project/ProjectMember/ProjectFile/Preview/PreviewSession and the K8s/MinIO/Redis preview pipeline), and `intelligence-service` (ChatSession/ChatMessage/ChatEvent/CodeNote/UsageEvent/UsageLog and the AI-generation/code-insight/idea/usage pipeline) — each with its own database and its own Firebase/session/CSRF chain. `legacy-monolith/` is **switched off** and is not started for normal development; it stays in the tree only as the rollback target until it is deleted (see `docs/migration/phase-4-cutover.md`, Phase 4). Local dev therefore starts **six** processes: discovery, the three services, the Gateway, and the frontend.

## Contents

- [Prerequisites](prerequisites.md)
- [First-Time Setup](setup.md)
- [Working Without Real AI Calls](without-ai.md)
- [Running Live Previews Locally](live-previews.md)
- [Running the Backend Test Suite](tests.md)
- [Common Problems](troubleshooting.md)
- [Useful Commands](commands.md)
