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

**Removed:** the legacy username/password rollback path (`LegacyAuthController` — `/api/auth/signup`, `/login`, `/forgot-password`, `/reset-password`, all returning a Bearer JWT) was removed once Firebase sign-in was confirmed stable. If you're reading old commit history or an old client integration, those routes no longer exist (401, not 404 — Spring Security's `anyRequest().authenticated()` rejects the request before routing ever determines there's no controller mapping).
