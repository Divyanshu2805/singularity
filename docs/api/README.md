# API Reference

Contracts for the backend's REST API. No OpenAPI spec is currently exposed publicly — `springdoc-openapi` is installed and serves `/v3/api-docs`/`/swagger-ui.html`, but neither path is exempted in `security/WebSecurityConfig.java`, so an unauthenticated visit gets a plain 403 (see `TODO.md`). This page is the narrative reference until that's fixed.

**Base URL:** `http://localhost:8000` locally — the Gateway, which routes each path to the service that owns it (see `docs/migration/phase-4-cutover.md`, Phase 4, for the table). The endpoint shapes below are unchanged by the microservice split: they were verified endpoint-for-endpoint identical (62 method+path mappings), but this page is otherwise still written against the original monolith until Phase 5 rewrites it, and its Swagger remark above is true only of `legacy-monolith` (the new services don't ship springdoc). **Auth:** an `httpOnly` session cookie, minted after verifying a Firebase ID token — see [Authentication](authentication.md#authentication) below. (The legacy `Authorization: Bearer <jwt>` rollback path and its username/password endpoints were removed — Firebase is the only sign-in method now.) **Errors:** see [Error Taxonomy](errors.md#error-taxonomy).

Every endpoint requires authentication except `/api/auth/**` and `/webhooks/**` (Stripe can't carry a session). Every `@RequestBody` is validated (`@Valid` + Bean Validation) — see [Request Validation](validation.md#request-validation).

## Contents

- [Authentication](authentication.md)
- [Projects](projects.md)
- [Files](files.md)
- [AI Chat / Code Generation](chat.md)
- [Idea Clarifier](ideas.md)
- [Code Insight (Code Lens / Code Notes)](code-insight.md)
- [Live Previews](previews.md)
- [Billing](billing.md)
- [Usage](usage.md)
- [Request Validation](validation.md)
- [Error Taxonomy](errors.md)
- [Known Behavior Worth Knowing About](../known-gaps/api-behavior.md)
