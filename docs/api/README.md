# API Reference

The contract for VibeCraft's REST API. There is no generated OpenAPI spec, so these pages are the reference: when an endpoint's shape changes, update its page in the same change.

## Base URL and routing

All browser traffic goes to the Gateway — `http://localhost:8000` locally, the app's own origin in production. In development the Vite dev server proxies `/api` there, so the frontend always calls same-origin relative paths. The Gateway forwards each path, unmodified, to the service that owns it:

| Path prefix | Owning service |
|---|---|
| `/api/auth/**`, `/api/plans`, `/api/me/**`, `/api/payments/**`, `/webhooks/payment` | account-service |
| `/api/projects/**` (except `.../code/**`), `/api/previews` | workspace-service |
| `/api/chat/**`, `/api/ideas/**`, `/api/usage/**`, `/api/projects/{id}/code/**` | intelligence-service |
| `/internal/**` | Never routed — service-to-service only |

A path no route owns is a 404 from the Gateway. `RoutingTableTest` pins every documented path to its owner.

## Conventions

**Authentication.** Requests are authenticated by an `httpOnly` session cookie (`vc_session`) issued after a Firebase sign-in. Every endpoint requires it except `GET /api/auth/csrf`, `POST /api/auth/session`, `POST /api/auth/logout`, `GET /api/plans` and `POST /webhooks/payment`. See [Authentication](authentication.md).

**CSRF.** Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) must send the `X-XSRF-TOKEN` header, echoing the `XSRF-TOKEN` cookie. Call `GET /api/auth/csrf` once on load to obtain it.

**Authorization.** Project-scoped endpoints check the caller's role on that project. The tables on each page state the minimum role (`VIEWER`, `EDITOR`, `OWNER`) or permission (`VIEW`, `EDIT`).

**Request bodies** are JSON and validated; a validation failure is a `400` listing every invalid field. See [Request validation](validation.md).

**Errors** share one JSON shape from every service. Branch on `status` and on the presence of `quota` (402) or `code` (503), never on message text. See [Errors](errors.md).

**Quotas.** A request that would exceed the caller's plan returns `402` before any expensive work starts, with a `quota` object describing the limit.

**Streaming** endpoints use server-sent events. There are two different payload formats; see [Streaming](streaming.md).

## Endpoints

| Area | Service | Page |
|---|---|---|
| Sign-in, sessions, security events | account | [Authentication](authentication.md) |
| Plans, subscriptions, checkout, Stripe webhook | account | [Billing](billing.md) |
| Projects, members, pin and star, fork | workspace | [Projects](projects.md) |
| File tree, content, search, ZIP download | workspace | [Files](files.md) |
| Revision history and restore | workspace | [Revisions](revisions.md) |
| Live previews | workspace | [Previews](previews.md) |
| AI chat and code generation | intelligence | [Chat](chat.md) |
| Idea clarifier | intelligence | [Ideas](ideas.md) |
| Code explanations, questions and notes | intelligence | [Code insight](code-insight.md) |
| Usage meter, insights, export | intelligence | [Usage](usage.md) |
| Service-to-service API | all | [Internal API](internal.md) |

## Reference

- [Streaming](streaming.md) — the two SSE formats and keep-alives.
- [Errors](errors.md) — the error shape and every exception → status mapping.
- [Request validation](validation.md) — notable constraints.
- [API behavior worth knowing](../known-gaps/api-behavior.md) — responses that are easy to mistake for bugs.
