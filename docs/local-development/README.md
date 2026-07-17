# Local Development

**This backend is mid-migration to microservices** (see `docs/migration/` for what's moved so far and why). As of Phase 0, `legacy-monolith/` is still the untouched original backend — every flow runs from there exactly as before — but the frontend now talks to it through a new `gateway-service` (a transparent reverse proxy today, so behavior is unchanged) instead of hitting it directly, and both register with a new `discovery-service` (Eureka). This means local dev now starts **four** processes instead of two — see below.

## Contents

- [Prerequisites](prerequisites.md)
- [First-Time Setup](setup.md)
- [Working Without Real AI Calls](without-ai.md)
- [Running Live Previews Locally](live-previews.md)
- [Running the Backend Test Suite](tests.md)
- [Common Problems](troubleshooting.md)
- [Useful Commands](commands.md)
