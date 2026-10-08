# Security Model

Singularity runs code written by an AI on behalf of its users, stores their projects, and bills them. This page describes the boundaries that keep those concerns apart and where each one is enforced. The rules contributors must not break are summarised in [security guardrails](../practices/security-guardrails.md); how to report a vulnerability is in [`SECURITY.md`](../../SECURITY.md).

## Identity and sessions

- **Firebase is the only identity provider.** Sign-in (password, Google, second factor) happens in the browser against Firebase. The backend only ever receives a Firebase ID token and exchanges it for its own session cookie. See [ADR 0002](decisions/0002-firebase-identity-with-server-sessions.md).
- **The session is an `httpOnly` cookie** (`__Host-vc_session`, 5 days). Each service verifies it independently and caches the result for at most 60 seconds.
- **Sign-out is revocation, not just cookie deletion.** The cookie's SHA-256 is recorded in account-service, and the other services are told to evict it immediately. See [authentication flow](flows/authentication.md).
- **Both cookies carry the `__Host-` prefix** (`__Host-vc_session` and the CSRF token's `__Host-XSRF-TOKEN`). Live previews are served from a sibling subdomain of the app, and a page there can set cookies for the shared parent domain; a browser refuses a `__Host-` cookie that was not set by this exact host, over a secure connection, with `Path=/` and no `Domain`, so a preview page cannot plant a session or CSRF token of its own. The prefix requires `Secure`, which `CsrfCookie` forces because the services see plain http from the Gateway. A separate registered domain for previews would remove the class of problem rather than mitigate it; see [known gaps](../known-gaps/README.md).
- **The client's address is read from `X-Forwarded-For`.** Behind cloudflared and the Gateway every request arrives from a private pod address, so each service sets `server.forward-headers-strategy: native` and Tomcat takes the first non-private address from the right of the list; entries a client forges to the left are never reached. The Gateway trusts every caller's header (`trusted-proxies`) because that decision is made at the services. Rate limiting and the security-events trail depend on this.
- **Request bodies are capped at the Gateway** (`RequestSize`, 1 MB, judged by `Content-Length`), because no service limits a JSON body before reading it into memory. The chat message is also capped at 16,000 characters.
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

Generated project code runs only inside live-preview runner pods in the `singularity-ai` namespace, reached through the Kubernetes `exec` API. The one place it is handled in-process is intelligence-service's syntax check (`llm/SyntaxCheck`), which **parses** a written file and never runs it: the file is passed as a string argument to the Babel parser, which runs on GraalJS in a context with no host access - no files, no network, no Java classes. The file never becomes part of a script that is evaluated. Runner pods:

A build turn's files are also type-checked before they are saved (`CodeCheckServiceImpl` in workspace-service), and that happens in the same place: the files are laid out in a scratch folder of the project's own running preview pod and the TypeScript compiler reads them there. They are never written to a service's disk, and the preview's own copy of the project is not touched. A path reaches the pod only after `ProjectFilePath` has accepted it, inside single quotes with any quote escaped; a package name is put in a command only after it matches the registry's naming rule. The endpoint that asks for the check is under `/internal/**`.

- run as a non-root user with every Linux capability dropped and no mounted service-account token;
- are bound by a `LimitRange`, a `ResourceQuota`, and a kubelet PID limit (1024), so a fork bomb or a runaway install can't exhaust the node;
- sit behind a `NetworkPolicy` that admits traffic only from the preview proxy, allows MinIO on its port, and blocks the cluster's private address ranges and the cloud metadata endpoint (`169.254.0.0/16`);
- read project files with a MinIO user scoped to `GetObject` / `ListBucket` on the projects bucket only.

The namespace split (`singularity` for trusted workloads, `singularity-ai` for previews) keeps network policy for untrusted pods from ever having to reason about trusted workloads in the same namespace.

## Browser hardening

- **The SPA is served with security headers** (`frontend/nginx.conf`, `security-headers.conf`, and a build-generated `csp-header.conf`): the Content Security Policy as a header with `frame-ancestors 'none'` (so the app cannot be framed, including by a preview), HSTS, `nosniff`, `X-Frame-Options`, a referrer policy, a permissions policy, and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (not `same-origin`, which would sever Google sign-in's popup). They are repeated inside each `location` because nginx drops outer-level headers once a location sets its own. The CSP is generated from `frontend/csp.ts`, the same source as the meta tag.
- **The preview iframe is sandboxed** (`PREVIEW_SANDBOX` in `frontend/src/lib/preview.ts`): scripts, forms, popups, modals and downloads are allowed, top-level navigation is not. `allow-same-origin` stays because the message check and the proxy cookie need the preview's own origin; that is safe only because the preview origin is not the app's.

## Preview access tokens

A preview hostname is not a credential. Every `previewUrl` carries a short-lived HMAC-signed token that the proxy verifies statelessly, then exchanges for a cookie. The token's lifetime (6 hours by default) bounds how long a removed member's open tab keeps working. Details: [live preview flow](flows/live-preview.md#access-boundary).

## What a viewer may do with a preview

Any member, a viewer included, may open the preview, read its output and close their own session: looking at the running app is what viewing a project means, their session counts against their own plan, and closing it ends nobody else's. **Restarting requires `EDIT`** (`PreviewDeploymentServiceImpl.restartPreview`), because it bounces the one dev server every collaborator shares — a viewer could otherwise interrupt an editor mid-change at will. The browser hides the button from a viewer and the server refuses one who asks anyway; `PreviewAuthorizationTest` pins both directions.

## Messages between the app and the preview

The previewed page is model-written code on another origin, and the two sides talk only by `postMessage`.

- **Into the app.** The Preview tab accepts a message only from the preview's exact origin and its own frame's window, and then reads it through `frontend/src/lib/preview-frame.ts`, which treats every field as untrusted: wrong types drop the message, text is cut to a fixed length, a batch of console lines is capped. Nothing a page sends is rendered as HTML.
- **Into the page.** The proxy's injected script (`proxy/reporter.js`) acts only on messages from its parent window, and can only do what a person at the page's own address bar could: back, forward, reload, or open a path. A path that resolves to any other origin is ignored, on both sides — the address bar refuses it before sending, and the script refuses it on receipt — so the bar cannot load another site into the frame under the preview's cookie.
- **The sandbox is what keeps back and forward inside the frame.** A sandboxed frame without leave to navigate its parent has a history traversal that would move the parent refused by the browser.

## File paths

Every stored project file path goes through workspace-service's `ProjectFilePath`, which rejects absolute paths, backslashes, control characters, and any `.` or `..` segment. MinIO treats keys as opaque strings, so path traversal is invisible there — but stored paths later become **ZIP entry names** and the destination of the `mc mirror` into a **preview pod's `/app`**, and both of those resolve `..`. Paths are validated on the way in, and object keys are never built by string concatenation.

## AI prompt boundaries

- **Code insight is read-only by construction.** The code-insight model is given exactly one tool (`read_files`) and its prompts (`llm/CodeInsightPrompts.java`) never mention the file-writing protocol. The tool implementation is typed against `ProjectFileReader` (tree and content reads only), not the write-capable workspace client, which only the generation pipeline holds. Widening `ProjectFileReader` would remove a compile-time guarantee. The "Explain in detail" a build step offers in the main chat is an ordinary question to this same read-only model: it names the step and its file, and the file is read through the tool, never pasted into the prompt. Teaching mode's step lesson is the one call that is given file text outright and no tool: the lines one step changed, bounded in length, taken from the caller's own saved turn. The request carries only the id of the saved file edit, and the lookup matches that id together with the project and the caller, so an id from another member's conversation is simply not found; the turn must also have been asked for in teaching mode.
- **Client-supplied history is untrusted.** `AskCodeRequest.history` is replayed into the model's message list, so each turn's `role` is validated by value: anything other than `"assistant"` becomes a user message. A client sending `role: "system"` cannot smuggle instructions in. Any new endpoint that replays client history needs the same check.
- **Project files are material, not instructions.** The build model is shown file contents — in the project brief (`llm/ProjectBrief`) and through `read_files` — fenced by marker lines and labelled as content, because a file's author is not always the person asking: a collaborator can edit a project, and a fork carries its original author's files. The build model's only capability is writing files into that same project; it has no network or shell tool. Text planted in a file can therefore do nothing its author could not have written into the project directly — the reason this is acceptable for the build path and would not be for a model that could act elsewhere.
- **Suggestions never see a file.** The call that proposes next steps (`llm/SuggestionPrompts`) is given the caller's own last request, what the build said and file paths - no file contents and no tool - so nothing a collaborator or a fork's first author wrote in a file can become a button in someone else's chat. Its answer is read defensively: a line holding markup, a tag or code never becomes a suggestion. Only someone who may edit the project can ask.
- **A preview error is the user's to send.** The **Fix this** button puts the error into the chat as the person's own next message (`frontend/src/lib/preview-fix.ts`); it is shown only to someone who may edit, is capped at two tries for the same error, and the error text is cut to a few hundred characters. The error comes from the preview's page, which is generated code - so it reaches the model as a user message describing a fault, under the same build prompt and with the same single capability, writing files into that project.
- **Prompts are not logged.** No deployed service sets `logging.level.org.springframework.ai.chat.client: DEBUG`, which would log every prompt and response in full.

## Sign-out data isolation (frontend)

A client-side route change after sign-out does not clear module-level state: the chat, code-notes, idea-interview and project-leaving stores live for the page's lifetime, and `sessionStorage` survives a reload. `frontend/src/lib/session.ts` solves this in one place: stores register a reset with `onSignOut(reset)`, and `signOut()` leaves through a full document reload (`window.location.assign`), so anything that forgot to register is discarded anyway. Any new module-level store holding project- or user-specific data must register there.

**The one deliberate exception is the landing page's pending idea** (`frontend/src/lib/pending-idea.ts`). An idea a visitor types into the landing page's prompt, or picks from its example cards, is kept in `localStorage` and is not registered with `onSignOut`, because signing *in* runs the same teardown and the idea has to survive that step to reach the dashboard's prompt. It is not account data: it can only be written while nobody is signed in, it is removed the moment the dashboard reads it, and it is ignored after an hour, so a forgotten one cannot turn up in a stranger's prompt on a shared browser. The dashboard only puts it back in the prompt; it never sends it.

## Secrets

Every secret is a bare environment-variable placeholder in `application.yaml` with no committed fallback, so a missing value fails startup instead of running insecurely. In production, Kubernetes Secrets are rebuilt from the GitHub `production` environment on every deploy; nothing is hand-edited on the server. See [deployment configuration](../deployment/configuration.md).
