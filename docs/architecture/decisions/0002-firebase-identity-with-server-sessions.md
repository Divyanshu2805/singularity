# 0002. Firebase identity with server-issued sessions

**Status:** Accepted

## Context

The first version stored usernames and passwords and issued its own bearer JWTs. That made the backend responsible for password storage, reset flows, and second factors — sensitive work that a hosted identity provider already does well. Bearer tokens held in JavaScript are also exposed to any script running on the page, and they cannot be revoked for a single device.

## Decision

Use Firebase Authentication as the **only** sign-in method (password, Google, and second factors, all handled in the browser). The backend receives a Firebase ID token once, verifies it, and issues its own `httpOnly` session cookie (`vc_session`, 5 days).

- Every service verifies the cookie itself, caching the result for at most 60 seconds.
- Sign-out records the cookie's hash as revoked and pushes an eviction to the other services, so a single device can be signed out immediately.
- Because the session is a cookie, every state-changing request requires a CSRF token.

The legacy username/password endpoints were removed.

## Consequences

- No password ever reaches the backend.
- The session can't be read by page scripts, but CSRF protection becomes mandatory and can never be disabled for the session path.
- Workspace and intelligence depend on account-service for revocation and user lookups on a cache miss, so those internal calls are tightly bounded by timeouts.
- A running project's Firebase configuration (authorized domains) must list every hostname the app is served from.
