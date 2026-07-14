# Authentication

Sign-in itself happens client-side against **Firebase Authentication** (password, Google, two-step codes) — this server only ever sees the resulting Firebase ID token and turns it into its own session cookie. No password ever reaches this API on the primary path.

## `AuthController` (`/api/auth`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/auth/csrf` | — | 204, sets `XSRF-TOKEN` cookie | Public. Call once on load to get a token to echo back as `X-XSRF-TOKEN` on the first write. |
| POST | `/api/auth/session` | `{ idToken }` | `{ user, expiresAt }` | Public. Verifies the Firebase ID token, finds/creates the `User` by `firebaseUid`, mints a 5-day session cookie, records an audit event. |
| POST | `/api/auth/logout` | — | 204, clears cookie | Public (no valid session required). Also revokes the session server-side (`RevokedSession`) so a copied cookie stops working immediately. |
| POST | `/api/auth/logout-all` | — | 204 | Authenticated. Revokes every session for the account, not just this one. |
| GET | `/api/auth/me` | — | `UserProfileResponse` | Authenticated. |
| GET | `/api/auth/security-events` | — | `List<AuthAuditEventResponse>` | Authenticated. The caller's own sign-in history. |
| POST | `/api/auth/report-security-event` | `ReportSecurityEventRequest` | 204 | Authenticated. Lets the client fold a self-detected event (an MFA change it made directly with Firebase) into the same audit trail. |

**CSRF:** every write above except `POST /api/auth/session`/`/logout` (which happen before a session, and therefore a CSRF cookie, exists) needs a matching `X-XSRF-TOKEN` header (Spring Security's `.spa()` double-submit cookie).

## `LegacyAuthController` (`/api/auth`) — rollback path

Gated by `app.auth.legacy.enabled` (default `true`). The pre-Firebase username/password flow, kept only until Firebase sign-in is confirmed stable in production.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `SignupRequest` | `AuthResponse` (Bearer JWT) | |
| POST | `/api/auth/login` | `LoginRequest` | `AuthResponse` (Bearer JWT) | |
| POST | `/api/auth/forgot-password` | `{ email }` | 202 always | Never reveals whether the address has an account. If one exists, emails a reset link (Mailpit in dev). |
| POST | `/api/auth/reset-password` | `{ token, newPassword }` | 204, or 400 if invalid/expired | Deletes every reset token the user has on success, so a used or superseded link can't work twice. |

A request carrying `Authorization: Bearer ...` with **no** session cookie present is verified via this legacy JWT path by `SessionAuthFilter`; either auth method lands the same `UserPrincipal` in the `SecurityContext`.
