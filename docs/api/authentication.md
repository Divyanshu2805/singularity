# Authentication

*Owner: `account-service`.* Sign-in itself happens client-side against **Firebase Authentication** (password, Google, two-step codes) — this server only ever sees the resulting Firebase ID token and turns it into its own session cookie. No password ever reaches this API.

## `AuthController` (`/api/auth`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/auth/csrf` | — | 204, sets `XSRF-TOKEN` cookie | Public. Call once on load to get a token to echo back as `X-XSRF-TOKEN` on the first write — including `POST /api/auth/session`. |
| POST | `/api/auth/session` | `{ idToken }` | `SessionResponse { user, expiresAt, newAccount, secondFactorUsed }` | Public. Verifies the Firebase ID token, finds/creates the `User` by `firebaseUid`, mints a 5-day session cookie, records an audit event. `newAccount` is true when this sign-in created the account; `secondFactorUsed: false` lets the client suggest adding one. Rate-limited to 10 per minute per IP. |
| POST | `/api/auth/logout` | — | 204, clears cookie | Public (no valid session required). Also revokes the session server-side (`RevokedSession`) so a copied cookie stops working — in every service — immediately, not after the 60 s session-cache lifetime. |
| POST | `/api/auth/logout-all` | — | 204 | Authenticated. Revokes every session for the account, not just this one. |
| GET | `/api/auth/me` | — | `UserProfileResponse { id, username, name }` | Authenticated. |
| GET | `/api/auth/security-events` | — | `List<AuthAuditEventResponse>` | Authenticated. The caller's own sign-in history. |
| POST | `/api/auth/security-events` | `ReportSecurityEventRequest { type, idToken }` | 204 | Authenticated. Lets the client fold a self-detected event (an MFA change or password change it made directly with Firebase — `MFA_ENROLLED`, `MFA_REMOVED`, `PASSWORD_CHANGED`) into the same audit trail. The ID token must be fresh from that change and belong to the signed-in user. |

**CSRF:** the session is a cookie the browser attaches on its own, so every write — `POST /api/auth/session` and `/logout` included — needs a matching `X-XSRF-TOKEN` header (Spring Security's `.spa()` double-submit cookie; the `XSRF-TOKEN` cookie is re-issued on every response, so read it fresh, and retry once on a CSRF 403). The only exemptions are `/webhooks/**` (Stripe's signature authenticates it) and `/internal/**` (the shared secret does). That is why `GET /api/auth/csrf` exists and is the first call a client makes.

**Removed:** the old username/password rollback path (`/api/auth/signup`, `/login`, `/forgot-password`, `/reset-password`, all returning a Bearer JWT) no longer exists. Those routes return 401, not 404 — Spring Security's `anyRequest().authenticated()` rejects the request before routing ever determines there's no controller mapping.
