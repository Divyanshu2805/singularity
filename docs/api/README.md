# API Reference

Contracts for the backend's REST API. There is no OpenAPI spec: the services don't ship `springdoc-openapi`, so this page is the reference. When an endpoint's shape changes, change it here in the same commit.

**Base URL:** `http://localhost:8000` locally — the Gateway. The browser only ever talks to it (in development the Vite dev server proxies `/api` there), and it forwards each path, unmodified, to the service that owns it:

| Path prefix | Owning service |
|---|---|
| `/api/auth/**`, `/api/plans`, `/api/me/**`, `/api/payments/**`, `/webhooks/payment` | `account-service` |
| `/api/projects/**` (except `.../code/**`), `/api/previews` | `workspace-service` |
| `/api/chat/**`, `/api/ideas/**`, `/api/usage/**`, `/api/projects/{id}/code/**` | `intelligence-service` |
| `/internal/**` | *never routed* — service-to-service only, see [Internal API](internal.md#internal-api-service-to-service) |

The route table is `gateway-service/src/main/resources/application.yaml`; `RoutingTableTest` pins every path in this file to its owner. A path no route owns is a 404 from the Gateway.

**Auth:** an `httpOnly` session cookie (`vc_session`, 5 days), minted after verifying a Firebase ID token — see [Authentication](authentication.md#authentication) below. Every service authenticates its own requests; the Gateway adds no auth. **CSRF:** every write needs the `X-XSRF-TOKEN` header (details under Authentication). **Errors:** see [Error Taxonomy](errors.md#error-taxonomy).

Every endpoint requires authentication except `GET /api/auth/csrf`, `POST /api/auth/session`, `POST /api/auth/logout`, `GET /api/plans` and `/webhooks/**` (Stripe can't carry a session). Every `@RequestBody` is validated (`@Valid` + Bean Validation) — see [Request Validation](validation.md#request-validation).

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
- [Internal API (service-to-service)](internal.md)
- [Request Validation](validation.md)
- [Error Taxonomy](errors.md)
- [Known Behavior Worth Knowing About](../known-gaps/api-behavior.md)
