# 4. Request Flows

Three flows, each with real file paths, since these three cover almost everything non-trivial in the system.

## 4.1 Auth: signing in, and how every service trusts the session

1. **Browser signs in against Firebase directly** — no request to this backend yet. `frontend/src/lib/firebase-auth.ts`.
2. **Exchange the ID token** — `POST /api/auth/session { idToken }` → Gateway → `account-service` `AuthController` → `SessionServiceImpl.createSession` → `FirebaseIdentityVerifier` verifies the token → find/create the `User` by `firebaseUid` → `SessionCookies` mints the `httpOnly` `vc_session` cookie (5 days) → `AuthAuditService` records `SIGN_IN`.
3. **Every later request** carries that cookie to whichever service owns the URL. In each service, `SessionAuthFilter` (ahead of `UsernamePasswordAuthenticationFilter`) hands it to `SessionAuthenticator`, which checks its in-process `SessionCache` first (an entry lives at most `app.auth.revocation-check-interval`, 60 s), and on a miss: asks whether the cookie hash is revoked, verifies the cookie with Firebase, and resolves the Firebase uid to a user. In `account-service` those two lookups are local tables; in `workspace-service` and `intelligence-service` they are `GET /internal/v1/sessions/revoked` and `GET /internal/v1/users/by-firebase-uid` on account. The result is a `UserPrincipal` in the `SecurityContext`, read everywhere through `AuthUtil.getCurrentUserId()`.
4. **Sign-out.** `POST /api/auth/logout` records a `RevokedSession` (the cookie's SHA-256) in account's database, then `SessionEvictionNotifier` tells every running workspace and intelligence instance — found through Eureka — to drop that entry (`POST /internal/v1/sessions/evict`), so the cookie stops working there immediately rather than after the 60 s cache lifetime. Delivery is best-effort and bounded (500 ms connect, 1 s read); the cache lifetime is the backstop. Sign-out-everywhere revokes at Firebase and evicts by user.
5. **Role checks** are per request via `@PreAuthorize("@security.canEditProject(#projectId)")` → `SecurityExpressions`. In workspace that reads its own `project_members`; in intelligence it asks workspace (`getMembership`). Both resolve the same `ProjectRole` → `Set<ProjectPermission>` mapping (see `docs/schema/`).

Firebase is the only sign-in method. `AuthUtil` is a thin `SecurityContextHolder` reader with no token logic of its own.

## 4.2 AI chat: prompt → generated files

This is the platform's core loop — a user asks for something, and files actually get written. It runs in `intelligence-service`, which reaches workspace over its internal API for anything about the project.

```mermaid
sequenceDiagram
    participant FE as Frontend (ChatPanel.tsx)
    participant CC as ChatController
    participant AG as AiGenerationServiceImpl
    participant AI as OpenRouter (Spring AI ChatClient)
    participant WS as workspace-service (internal API)
    participant DB as intelligence DB

    FE->>CC: POST /api/chat/stream {message, projectId}
    CC->>AG: streamResponse() [canEditProject via workspace; 402 if over the daily budget]
    AG->>WS: file tree (ProjectFileReader) for the FileTreeContextAdvisor
    AG->>AI: Flux.defer(chatClient.prompt()...)
    Note over AI: PromptUtils system prompt: <message>/<todo>/<file>/<tool>/<learn> tags
    AI->>WS: readFiles tool call -> file content
    AI-->>CC: streamed raw text chunks
    CC-->>FE: SSE {text} chunks (also parsed live client-side by use-stream-parser.ts)
    AI-->>AG: stream completes
    AG->>AG: LlmResponseParser regex-parses tags into ChatEvent rows
    AG->>WS: POST /internal/v1/projects/{id}/files per <file> tag (isolated try/catch)
    AG->>DB: save ChatMessage + ChatEvent rows (batch, falls back to one-at-a-time on failure)
    AG->>DB: UsageService.recordTokenUsage (UsageLog counter + UsageEvent ledger)
```

Real files, in the order the flow touches them (all under `intelligence-service/.../intelligence/`):

1. **`ChatController.streamChat`** (`controller/`) — the SSE endpoint. `@PreAuthorize("@security.canEditProject(#projectId)")` sits on the service method, not the controller.
2. **`AiGenerationServiceImpl.streamResponse`** (`service/impl/`) — the whole pipeline lives here. It calls `UsageService.assertWithinDailyTokenBudget()` **synchronously, before building the `Flux`**, so a quota refusal is a real HTTP 402, not an SSE error event. The plan's limit comes from account over Feign.
3. **`GenerationRegistry`** — the in-process record of a running generation. Closing the browser connection only stops *watching*; the generation continues and can be re-attached (`GET .../active/stream`) or stopped (`POST .../active/stop`). A second generation for the same project and user is a 409.
4. **`llm/advisors/FileTreeContextAdvisor`** — a Spring AI `StreamAdvisor` that injects the project's current file tree as an extra system message on every request (and a NOTICE if the project's `templateInitIssue` is set).
5. **`llm/PromptUtils.getSystemPrompt(TeachingMode)`** — the system prompt: a custom XML-tag protocol (`<tool>`/`<message>`/`<todo>`/`<file>`/`<delete>`, plus `<learn>` when teaching mode is on), **not** Spring AI's structured-output format. `llm/tools/CodeGenerationTools.readFiles` is the one `@Tool` the model can call.
6. **Retry wrapping**: the whole `chatClient.prompt()...` call is wrapped in `Flux.defer(...)`, not `.retryWhen(...)` attached to the stream directly — Spring AI's advisor chain is single-use per subscription, so resubscribing to an already-built `Flux` on retry throws. `Flux.defer` rebuilds the whole call (fresh advisor chain included) on each retry. An OpenRouter 429 is retried up to 3 times with backoff.
7. **`llm/LlmResponseParser`** — once the stream completes, regex-matches the tags back out of the raw text into typed `ChatEvent` rows (`THOUGHT`/`MESSAGE`/`TODO`/`FILE_EDIT`/`LEARN`/`TOOL_LOG`, and `FILE_DELETE`). A `<todo path="...">`'s `path` must match a later `<file path="...">` **byte for byte** — that string equality is the entire client-side checklist tick-off mechanism (`frontend/src/components/ChatEventRenderer.tsx`).
8. **`finalizeChats`** (in `AiGenerationServiceImpl`) — runs on `Schedulers.boundedElastic()` *after* the stream, off the request thread, so it carries the user id explicitly rather than reading it from a `SecurityContext` that isn't there. For each file it snapshots the previous content (so the editor can show the turn's diff), then writes through `WorkspaceServiceClient.saveFile`/`deleteFile` — one at a time, so one bad file doesn't lose the rest of the batch or the chat history. Then `ChatMessage` + its `ChatEvent` children are saved (`saveAll`, falling back to one-at-a-time if the batch fails — a single bad event shouldn't destroy an otherwise-good conversation record). **A generation that is stopped never reaches `finalizeChats`**: its output is discarded and not billed.
9. **`llm/AiUsageRecorder`** — records the exchange's token usage into the counter and the ledger.

**Self-correction that does *not* exist yet:** if the generated code fails to install or fails to boot in the live-preview pod, nothing feeds that failure back into another AI turn automatically. The model gets feedback only within *this* request/response cycle (e.g. `looksLikeAbandonedEdit` retrying once if the model narrated an edit but produced zero `FILE_EDIT` events) — never from an actual runtime/build failure. See `TODO.md`'s "AI prompt/generation reliability improvements" if this is being worked on.

## 4.3 Live preview: start a preview

This runs entirely in `workspace-service` (`.../workspace/`).

```mermaid
sequenceDiagram
    participant FE as Frontend (PreviewPanel.tsx)
    participant PC as PreviewController
    participant PD as PreviewDeploymentServiceImpl
    participant Pool as PreviewRunnerPool
    participant Boot as PreviewBootstrapper
    participant K8s as Kubernetes API (fabric8 client)
    participant Redis as Redis
    participant Proxy as proxy/index.js

    FE->>PC: POST /api/projects/{id}/preview
    PC->>PD: startPreview() [canViewProject; per-project lock; plan allowance from account: 402 PREVIEW_LIMIT]
    PD->>Pool: claim(projectId)
    Pool->>K8s: JSON merge patch (status: idle -> busy, project-id, claimed-at) with the listed resourceVersion
    PD->>Boot: start(previewId, projectId, isNewPreview) [async]
    Boot->>K8s: exec into syncer container: mc mirror (MinIO -> pod's /app)
    Boot->>K8s: exec into runner container: npm install && vite dev
    loop poll every few seconds
        Boot->>K8s: exec probe script (wget /@vite/client)
    end
    Boot->>PD: markRunning() once serving
    PD->>Redis: PreviewRouter writes route:<hostname> -> podIp:port
    PD-->>FE: previewUrl = http://<hostname>.localhost:8090/?pvt=<signed, expiring token>
    FE->>Proxy: browser loads previewUrl
    Proxy->>Proxy: verify token (HmacSHA256, PreviewAccessToken's scheme); 401 if invalid/expired
    Proxy-->>FE: 302, strips ?pvt=, Set-Cookie: pv_auth=<token>
    FE->>Proxy: browser follows the redirect, cookie attached
    Proxy->>Redis: GET route:<hostname>
    Proxy-->>FE: reverse-proxied to the pod's dev server
```

Real files:

1. **`PreviewController`** → **`PreviewDeploymentService`/`PreviewDeploymentServiceImpl`** (`service/`, `service/impl/`). Start and stop are serialized per project by an in-process lock, so two people opening Preview together share one runner and a Stop can't shut a runner someone is joining.
2. **`PreviewRunnerPool`** — claims a warm pod from the idle/busy label-swapped pool (`k8s/runner-pods.yml`: a Deployment that only selects `status=idle`, so relabelling a claimed pod to `busy` detaches it from the ReplicaSet and a replacement starts warming immediately). The claim is a **merge patch that carries the listed `resourceVersion`**, so two simultaneous claims of the same pod can't both win — the API server answers the loser 409 and it takes the next. It is a patch and not an `update` of the fetched Pod because `kubernetes-client` 6.13.4 can't serialize a Pod it read back under Boot 4.1's Jackson (`docs/local-development/`). No idle pod at all is a `CapacityUnavailableException` (503).
3. **`PreviewBootstrapper`** — execs into the pod's two containers: `syncer` (mirrors the project's MinIO objects in via the `mc` CLI, then watches for later changes) and `runner` (`npm install && vite dev --host 0.0.0.0 --port 5173`). Polls a probe script (`wget /@vite/client`, the single most Vite-specific line in the whole preview pipeline) until the dev server answers. Claims the bootstrap for this instance and refreshes that claim on every poll (CODE_REVIEW.md PRE-03, `Preview.bootstrapHeartbeatAt`); also exposes `checkHealth`/`restartWatcher` so `PreviewReaper` can keep checking the dev server and file-sync watcher's actual process health once the preview is running, not just at start (PRE-06).
4. **`PreviewRouter`** — once serving, writes `route:<hostname> -> <podIp>:<port>` to Redis.
5. **`proxy/index.js`** (a standalone Node process, **not** part of any Spring Boot service) — verifies the `?pvt=` access token (or the `pv_auth` cookie a valid one was already exchanged for) before doing anything else, then reads the route from Redis and reverse-proxies the browser's request to the pod directly; also records `seen:<hostname>` timestamps in Redis for the idle reaper. A Redis failure and a genuinely missing route return distinct responses (CODE_REVIEW.md PRE-08), and both HTTP and WebSocket proxying to the pod are timeout-bounded so a wedged dev server fails a request rather than hanging it.
6. **`PreviewSession`** (per-collaborator), **`PreviewLifecycle`** and **`PreviewReaper`** govern teardown — see `docs/schema/`'s `PREVIEW`/`PREVIEW_SESSION` entities for the full session-sharing model. The runner is torn down only when its last session ends or the reaper finds it idle, its pod has vanished, or (PRE-06) its dev server has crashed or gone unresponsive; a dead file-sync watcher is relaunched instead. Every reaper action re-reads the preview under its project's lock immediately before acting, since the snapshot `reap()` fetched a scan earlier can go stale against a concurrent Stop or restart (PRE-02). On startup, a leftover `CREATING` row is only failed if its bootstrap heartbeat is missing or stale, not unconditionally, so a rolling deployment's new instance doesn't fail a bootstrap another, still-live instance owns (PRE-03).

**Isolation boundary, stated plainly:** generated/user code executes **only** inside a runner pod, reached by the fabric8 Kubernetes client's `exec` API — never in-process in a Spring Boot service, never via a local shell call. If you're extending this, any change that runs untrusted project content outside a runner pod is a hard no.

**Access boundary** (CODE_REVIEW.md SEC-06): a preview's hostname alone used to be a permanent, unauthenticated bearer link — the proxy had no concept of project membership, so anyone who ever saw the URL kept working access forever, including a member later removed from the project. `PreviewAccessToken.java` (`workspace/util/`) signs `hostname + "." + expiresAt` with HMAC-SHA256 (`preview.access-token-secret`); `PreviewDeploymentServiceImpl.withAccessToken` appends it to every `previewUrl` it hands out, always from an already-`@PreAuthorize`-guarded method. `proxy/auth.js` re-implements the identical scheme in Node (byte-for-byte - `PreviewAccessTokenTest`'s cross-language contract test in Java and `proxy/auth.test.js` in Node both pin the same known-good HMAC value) to verify it statelessly, with no session store of its own. A valid token is exchanged once, on first load, for a `SameSite=None; Secure` cookie (`None` because previews are shown in a cross-site iframe from the main app) - the token itself is then dropped from the URL via a redirect. `preview.access-token-ttl` (6h default) is what actually bounds how long a removed member's already-open tab keeps working: there is nothing to push a live revocation to, so this is an expiry bound, not instant revocation. `PreviewPanel.tsx` mints a fresh token on every poll but deliberately does **not** feed it straight into the iframe's `src` - see that file's header comment - or a routine 60-second poll would silently reload the iframe and drop whatever the embedded app's own state was.
