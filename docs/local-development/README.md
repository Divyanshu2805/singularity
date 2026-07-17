# Local Development

**This backend is mid-migration to microservices** (see `docs/migration/` for what's moved so far and why). `legacy-monolith/` is still the original backend — every route the frontend actually uses still runs from there — but the frontend now talks to it through a new `gateway-service` (a transparent reverse proxy today, so behavior is unchanged) instead of hitting it directly, and both register with a new `discovery-service` (Eureka). As of Phase 1, `account-service` also exists (User/Plan/Subscription/billing, its own database, its own Firebase/session/CSRF chain) but isn't reachable through Gateway yet — see `docs/migration/` for exactly why. This means local dev now starts **five** processes instead of two — see below.

## Contents

- [Prerequisites](prerequisites.md)
- [First-Time Setup](setup.md)
- [Working Without Real AI Calls](without-ai.md)
- [Running Live Previews Locally](live-previews.md)
- [Running the Backend Test Suite](tests.md)
- [Common Problems](troubleshooting.md)
- [Useful Commands](commands.md)
