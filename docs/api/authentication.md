# Authentication

Sign-in, sessions and the account's security history. **Service:** account-service · **Controller:** `AuthController` (`/api/auth`)

Sign-in itself happens in the browser against Firebase Authentication (password, Google, second factors). The backend only receives the resulting Firebase ID token and exchanges it for its own session cookie; no password ever reaches this API. See the [authentication flow](../architecture/flows/authentication.md).

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/auth/csrf` | — | `204`, sets the `XSRF-TOKEN` cookie | Public. Call once on load to get the token to echo as `X-XSRF-TOKEN` on the first write, including `POST /api/auth/session`. |
| `POST` | `/api/auth/session` | `{ idToken }` | `SessionResponse { user, expiresAt, newAccount, secondFactorUsed }` | Public. Verifies the Firebase ID token, finds or creates the user, sets the 5-day `vc_session` cookie, and records an audit event. `newAccount` is true when this sign-in created the account; `secondFactorUsed: false` lets the client suggest adding a second factor. Rate-limited to 10 per minute per IP. |
| `POST` | `/api/auth/logout` | — | `204`, clears the cookie | Public — no valid session required. Also revokes the session server-side, so a copied cookie stops working in every service immediately. |
| `POST` | `/api/auth/logout-all` | — | `204` | Revokes every session for the account. |
| `GET` | `/api/auth/me` | — | `UserProfileResponse { id, username, name }` | |
| `GET` | `/api/auth/security-events` | — | `List<AuthAuditEventResponse>` | The caller's own sign-in history. |
| `POST` | `/api/auth/security-events` | `ReportSecurityEventRequest { type, idToken }` | `204` | Records a change the client made directly with Firebase — `MFA_ENROLLED`, `MFA_REMOVED` or `PASSWORD_CHANGED` — in the same audit trail. The ID token must be fresh from that change and belong to the signed-in user. |

## CSRF

The session is a cookie the browser attaches automatically, so every write — including `POST /api/auth/session` and `/logout` — needs a matching `X-XSRF-TOKEN` header (Spring Security's double-submit cookie). The `XSRF-TOKEN` cookie is re-issued on every response: read it fresh before each write, and retry once on a CSRF `403`.

The only exemptions are `/webhooks/**` (authenticated by Stripe's signature) and `/internal/**` (authenticated by the shared secret).

## Removed endpoints

The original username/password endpoints (`/api/auth/signup`, `/login`, `/forgot-password`, `/reset-password`) no longer exist. They return `401` rather than `404`, because the security chain rejects unauthenticated requests before routing determines there is no handler.
