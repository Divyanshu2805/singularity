# Security Model

VibeCraft runs code written by an AI on behalf of its users, stores their projects, and bills them. This page describes the boundaries that keep those concerns apart and where each one is enforced. The rules contributors must not break are summarised in [security guardrails](../practices/security-guardrails.md); how to report a vulnerability is in [`SECURITY.md`](../../SECURITY.md).

## Identity and sessions

- **Firebase is the only identity provider.** Sign-in (password, Google, second factor) happens in the browser against Firebase. The backend only ever receives a Firebase ID token and exchanges it for its own session cookie. See [ADR 0002](decisions/0002-firebase-identity-with-server-sessions.md).
- **The session is an `httpOnly` cookie** (`vc_session`, 5 days). Each service verifies it independently and caches the result for at most 60 seconds.
- **Sign-out is revocation, not just cookie deletion.** The cookie's SHA-256 is recorded in account-service, and the other services are told to evict it immediately. See [authentication flow](flows/authentication.md).
- **Sign-in is rate-limited** to 10 requests per minute per IP. All other traffic is limited to 600 requests per minute per signed-in user (per IP when anonymous), by a sliding-window `RateLimiter` in each service's filter chain.

## Tenancy

There is no platform-wide role. A user is only ever `OWNER`, `EDITOR` or `VIEWER` *of a particular project*, and every project-scoped operation is gated by `@PreAuthorize` calling `SecurityExpressions`, which resolves the caller's role for that project.

- **Where the guard goes.** A guard belongs where the *caller* is a user. `InternalWorkspaceController` calls `ProjectFileService` as a machine principal with no `UserPrincipal`, so the guard for file-tree and file-content reads sits on `FileController`, not on that service. The flip side: a browser-facing endpoint that reaches an *unguarded* service method is open to every signed-in user. `FileReadAuthorizationTest` pins both halves.
- **Revision ids are checked against their project.** Preview and restore of a revision answer 404 unless the revision belongs to the project in the path, so an editor of one project cannot restore or read another project's files through a guessed id.
- **`@PreAuthorize` parameter names must match exactly.** A SpEL expression that names `#projectId` on a method whose parameter is `id` evaluates to `null` and denies every caller, silently.

## CSRF

The session rides in a cookie the browser attaches on its own, so every state-changing request needs a matching `X-XSRF-TOKEN` header (Spring Security's SPA double-submit cookie). CSRF protection is never disabled for the session path. The only exemptions are callers that structurally cannot carry the header:

- `/webhooks/payment` — authenticated by Stripe's signature instead;
- `/internal/**` — authenticated by the shared secret instead.

## Internal API boundary

`/internal/v1/**` endpoints accept arbitrary user and project ids and perform **no ownership checks** — they read, write and delete any project's files. They are protected by three layers:

1. The Gateway has no route for `/internal/**`, so it is unreachable from the internet.
2. `InternalServiceAuthFilter` grants the `ROLE_INTERNAL_SERVICE` authority only to a caller presenting `INTERNAL_SERVICE_SHARED_SECRET`.
3. Every filter chain requires **that authority** on `/internal/**` — not merely an authenticated caller — ahead of its `anyRequest()` rule. A user's session cookie is authenticated on that path too, so "authenticated" alone would let any signed-in user in.

`InternalServiceAuthFilter` is also explicitly disabled as a plain servlet filter (`FilterRegistrationBean(enabled = false)` in `CommonLibAutoConfiguration`). Spring Boot auto-registers every `Filter` bean into the servlet chain, and without that it would grant the internal authority on paths where it was never meant to run.

## Untrusted-code isolation

Generated project code runs only inside live-preview runner pods in the `vibecraft-ai` namespace, reached through the Kubernetes `exec` API. Runner pods:

- run as a non-root user with every Linux capability dropped and no mounted service-account token;
- are bound by a `LimitRange`, a `ResourceQuota`, and a kubelet PID limit (1024), so a fork bomb or a runaway install can't exhaust the node;
- sit behind a `NetworkPolicy` that admits traffic only from the preview proxy, allows MinIO on its port, and blocks the cluster's private address ranges and the cloud metadata endpoint (`169.254.0.0/16`);
- read project files with a MinIO user scoped to `GetObject` / `ListBucket` on the projects bucket only.

The namespace split (`vibecraft` for trusted workloads, `vibecraft-ai` for previews) keeps network policy for untrusted pods from ever having to reason about trusted workloads in the same namespace.

## Preview access tokens

A preview hostname is not a credential. Every `previewUrl` carries a short-lived HMAC-signed token that the proxy verifies statelessly, then exchanges for a cookie. The token's lifetime (6 hours by default) bounds how long a removed member's open tab keeps working. Details: [live preview flow](flows/live-preview.md#access-boundary).

## File paths

Every stored project file path goes through workspace-service's `ProjectFilePath`, which rejects absolute paths, backslashes, control characters, and any `.` or `..` segment. MinIO treats keys as opaque strings, so path traversal is invisible there — but stored paths later become **ZIP entry names** and the destination of the `mc mirror` into a **preview pod's `/app`**, and both of those resolve `..`. Paths are validated on the way in, and object keys are never built by string concatenation.

## AI prompt boundaries

- **Code insight is read-only by construction.** The code-insight model is given exactly one tool (`read_files`) and its prompts (`llm/CodeInsightPrompts.java`) never mention the file-writing protocol. The tool implementation is typed against `ProjectFileReader` (tree and content reads only), not the write-capable workspace client, which only the generation pipeline holds. Widening `ProjectFileReader` would remove a compile-time guarantee.
- **Client-supplied history is untrusted.** `AskCodeRequest.history` is replayed into the model's message list, so each turn's `role` is validated by value: anything other than `"assistant"` becomes a user message. A client sending `role: "system"` cannot smuggle instructions in. Any new endpoint that replays client history needs the same check.
- **Prompts are not logged.** No deployed service sets `logging.level.org.springframework.ai.chat.client: DEBUG`, which would log every prompt and response in full.

## Sign-out data isolation (frontend)

A client-side route change after sign-out does not clear module-level state: the chat and code-notes stores live for the page's lifetime, and `sessionStorage` survives a reload. `frontend/src/lib/session.ts` solves this in one place: stores register a reset with `onSignOut(reset)`, and `signOut()` leaves through a full document reload (`window.location.assign`), so anything that forgot to register is discarded anyway. Any new module-level store holding project- or user-specific data must register there.

## Secrets

Every secret is a bare environment-variable placeholder in `application.yaml` with no committed fallback, so a missing value fails startup instead of running insecurely. In production, Kubernetes Secrets are rebuilt from the GitHub `production` environment on every deploy; nothing is hand-edited on the server. See [deployment configuration](../deployment/configuration.md).
