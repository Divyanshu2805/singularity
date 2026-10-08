# Flow: Live Preview

Starting a preview claims a warm Kubernetes pod, syncs the project's files into it, runs the Vite dev server there, and routes a hostname to it through Redis and a small reverse proxy. Once it is up it keeps itself level with the project's files. This runs entirely in workspace-service.

## Steps

1. **`PreviewController` → `PreviewDeploymentServiceImpl`.** Start and stop are serialized per project by an in-process lock, so two collaborators opening the preview together share one runner, and a stop can't shut down a runner someone else is joining.
2. **`PreviewRunnerPool` claims a warm pod.** The pool is a Deployment that only selects pods labelled `status=idle`; relabelling a claimed pod to `busy` detaches it from the ReplicaSet, and a replacement starts warming immediately. The claim is a **JSON merge patch carrying the listed `resourceVersion`**, so two simultaneous claims of the same pod can't both win — the API server answers the loser with a 409 and it tries the next pod.
3. **No idle pod is not an error: the start waits in line.** The preview row is saved with no pod and the detail `Waiting for a free runner`, and the bootstrap asks for a pod every two seconds until one comes free or `preview.queue-timeout` (5 minutes) passes. See [the line](#the-line-for-a-runner).
4. **`PreviewBootstrapper` starts the app.** It execs into the pod's two containers:
   - `syncer` mirrors the project's MinIO objects into `/app` with the `mc` CLI, then keeps watching for changes. Every copy is one command that stops the watcher, mirrors once under its own 45-second limit, and starts the watcher again, so there is never a second writer beside the first;
   - `runner` runs `npm install && vite dev --host 0.0.0.0 --port 5173`.

   It polls a probe script (`wget /@vite/client`) until the dev server answers. The bootstrap claims ownership of the preview row and refreshes a heartbeat (`Preview.bootstrapHeartbeatAt`) on every poll. Once running, `PreviewReaper` keeps checking the dev server's and the file-sync watcher's actual process health.
5. **`PreviewRouter`** writes `route:<hostname> → <podIp>:<port>` to Redis.
6. **`proxy/index.js`** — a standalone Node process, not part of any Spring service — verifies the access token (or the cookie it was exchanged for), reads the route from Redis, and reverse-proxies the request to the pod. It also records `seen:<hostname>` timestamps for the idle reaper. A Redis failure and a missing route return distinct responses, and both HTTP and WebSocket proxying are timeout-bounded, so a wedged dev server fails a request rather than hanging it.
7. **`PreviewSynchronizer` keeps it level.** See [keeping up with the project](#keeping-up-with-the-project).
8. **Teardown.** `PreviewSession` (one per collaborator), `PreviewLifecycle` and `PreviewReaper` govern it; see [`PREVIEW_SESSION`](../../schema/workspace-service.md#preview_session). The runner is torn down only when its last session ends, or when the reaper finds it idle, its pod gone, or its dev server crashed or unresponsive. A dead file-sync watcher is relaunched instead. Every reaper action re-reads the preview under its project's lock just before acting, since a snapshot taken a scan earlier can be stale against a concurrent stop or restart. On startup, a leftover `CREATING` row is failed only if its bootstrap heartbeat is missing or stale, so a rolling deployment's new instance doesn't fail a bootstrap that another live instance still owns. A row that check leaves alone but whose bootstrap really is gone - a single instance that restarted in under thirty seconds - is failed by the sweep once its heartbeat is 75 seconds old, as a `PLATFORM` failure, so the tab starts it again by itself.

   A pod that has gone is also noticed without waiting for the reaper: `GET .../preview` checks the pod of a running preview its caller has open and ends it on the spot. The Preview tab asks the moment its frame shows one of the proxy's status pages, so a runner that dies is replaced within seconds rather than up to a minute.

## The line for a runner

A start that found no idle pod is a `CREATING` row with `podName IS NULL`. There is no queue table and no lock: the order is the rows' ids.

- A waiter claims only when no other waiter **with a fresh bootstrap heartbeat** has a lower id (`PreviewRepository.countWaitingAhead`). Requiring the heartbeat to be fresh is what stops a waiter abandoned by a dead instance from holding everyone behind it.
- A new start that finds anyone already waiting does not try for a pod at all; it goes to the back.
- A claimed pod is handed to the row with a conditional update that applies only while the row is still `CREATING` with no pod (`assignPod`). A waiter that Stop ended while it was claiming updates nothing and releases the pod at once.
- `PreviewResponse.queuePosition` is the caller's place (1 is next). The tab shows it and goes on polling; nothing is asked of the person.
- Past `preview.queue-timeout` the start fails with kind `CAPACITY`, which the tab does not retry by itself — it has already waited.

A pod comes free when a preview stops or idles out (`preview.idle-timeout`), and the pool's own replacement pod takes about a minute to warm, so a short wait is usually the second of those, not the first.

## Keeping up with the project

Nobody presses reload. The watcher in the `syncer` container carries most edits into the pod within a second and Vite hot-reloads them; `PreviewSynchronizer` covers what that leaves open and makes the result knowable.

- **What starts it.** `RevisionPublisherImpl` announces every published revision (`ProjectFilesChanged`), a bootstrap announces the same once its preview is up (for anything published while it was starting), and the reaper asks on every sweep in case a notice was lost.
- **What it does.** If the project's `currentFileRevisionId` is not the preview's `syncedRevisionId`, it marks the preview as updating, copies the files once more — so "up to date" is a fact rather than a hope about the watcher — and records the revision. A copy that fails is tried once more on the spot, then left to the next sweep with the preview still saying it is behind.
- **A new package.** Before recording, it compares `package.json` in the pod with the checksum the boot script left of the one it installed (`/tmp/installed.pkg`). If they differ it restarts the runner in place — same pod, same hostname, status back to `CREATING` with the detail `Installing new packages` — and the restart's own bootstrap records the revision. This used to be asked for by the browser tab that ran the turn, so a collaborator's tab or a restore never got it.
- **What the tab sees.** `PreviewResponse.syncState` is `UPDATING` while the two revisions differ and `UP_TO_DATE` when they match; the tab polls quickly while it is updating and shows the word beside the address.

One pass runs at a time per project, and a request that arrives during a pass makes it go round once more. That bookkeeping is in memory and per instance; two instances working on the same project would both copy the files, which is harmless.

## When a start fails

Every failure is recorded with a kind (`PreviewFailureKind`), one plain sentence, and the tail of the runner's output (`Preview.failureLog`, read back through `GET .../preview/logs`).

| Kind | What happened | The tab |
|---|---|---|
| `INSTALL` | `npm install` exited non-zero for a reason in `package.json`: a package or version that doesn't exist, packages that can't agree, invalid JSON | Shows the sentence and the output; no retry |
| `DEV_SERVER` | The dev server exited before answering: no `dev` script, a broken `vite.config`, a missing module | Shows the sentence and the output; no retry |
| `TIMEOUT` | The install or the dev server took longer than `preview.boot-timeout` | Shows the sentence and the output; no retry |
| `CAPACITY` | No runner came free within `preview.queue-timeout` | Says so; no retry |
| `PLATFORM` | The cluster, Redis, storage or the registry failed, or the service restarted mid-start | Tries again by itself, three times |

`util/PreviewFailureExplainer` turns npm's and Vite's output into the sentence and the kind. It matters that a registry timeout or a full disk comes out as `PLATFORM`: reported as `INSTALL` it would be blamed on the project and never retried.

Failures *after* the preview is up are the page's own, and the proxy's reporter carries them to the tab — see below.

## The page and the tab

The preview is another origin in a sandboxed frame, so messages are the only channel. On every page load the proxy injects a small script (`proxy/reporter.js`); the tab reads what it posts through `frontend/src/lib/preview-frame.ts`, which trusts nothing about a message's shape.

| The page says | The tab |
|---|---|
| `PreviewReady` | Uncovers the frame. Until then it is covered, so a page that isn't the app is never mistaken for it |
| `PreviewLocation` (path, can go back, can go forward) | Updates the address bar and the back and forward buttons |
| `PreviewError` — an uncaught error, an unhandled rejection, or Vite's compile-error overlay | Shows the error in plain words with **Fix this** and the output one click away |
| `PreviewErrorCleared` — the overlay went away | Takes the compile error down by itself |
| `PreviewBlank` / `PreviewRendered` — the page loaded and drew nothing; it drew something after all | Shows "The page is blank" with the same actions; takes it down |
| `PreviewConsole` — what the app wrote to its console, batched and capped | Adds the lines to the Console tab of the output panel |
| `PreviewStatusPage` (status) — this is one of the proxy's own pages | `401`: fetches a fresh link and reloads the frame. `404`: asks the server what happened. `502`/`503`: waits, and asks the server too |

The tab sends `PreviewCommand` back: `back`, `forward`, `reload`, and `navigate` with a path. The script acts only on messages from its parent window and only opens a path on its own origin.

A frame that loaded and said nothing at all within 12 seconds is reported as "The preview isn't showing your app", with Reload and the output.

## Isolation boundary

Generated and user-authored code executes **only** inside a runner pod, reached through the fabric8 Kubernetes client's `exec` API — never in-process in a Spring service, never through a local shell. Runner pods run as a non-root user with every Linux capability dropped, no service-account token, a PID limit, resource quotas, and a `NetworkPolicy` that admits traffic only from the preview proxy and blocks the cluster's private ranges and cloud metadata endpoints. Any change that runs untrusted project content outside a runner pod is out of bounds. See the [security model](../security-model.md#untrusted-code-isolation).

## Access boundary

A preview's hostname is not a credential. `util/PreviewAccessToken` signs `hostname + "." + expiresAt` with HMAC-SHA256 (`preview.access-token-secret`), and `PreviewDeploymentServiceImpl` appends a fresh token to every `previewUrl` it returns — always from a method already guarded by `@PreAuthorize`. `proxy/auth.js` implements the identical scheme in Node to verify it statelessly; `PreviewAccessTokenTest` (Java) and `proxy/auth.test.js` (Node) pin the same known-good HMAC value so the two implementations can't drift.

On first load the proxy exchanges a valid token for a `SameSite=None; Secure` cookie (`None` because the preview is shown in a cross-site iframe) and redirects to drop the token from the URL. `preview.access-token-ttl` (6 hours by default) bounds how long a removed member's already-open tab keeps working: this is an expiry bound, not instant revocation.

`PreviewPanel.tsx` fetches a fresh token on every poll but deliberately does not feed it straight into the iframe's `src`, which would reload the embedded app every poll and drop its state. When the cookie does run out — a tab left open past the six hours — the proxy answers with its `401` page, the page says so, and the tab loads the frame again with the fresh token it already has. A member who has been removed gets no fresh token, because the poll that would carry it is refused.

**Who may do what.** Any member, a viewer included, may open the preview, read its output and close their own session. Restarting needs `EDIT`: it bounces the one dev server every collaborator shares.

## Timing

The first start of a preview is dominated by `npm install`. In production the warm pool's init container seeds each idle pod's `node_modules` from a pre-built runner image (`docker/preview-runner.Dockerfile`), which cuts a typical start to a few seconds. The overall limit is `preview.boot-timeout` (4 minutes). Measured numbers are in [capacity](../../deployment/capacity.md#measured-start-times).

## Related

- [Live previews API](../../api/previews.md).
- [Running previews locally](../../local-development/live-previews.md).
- [Preview capacity](../../deployment/capacity.md) in production.
- [The preview checklist](../../local-development/preview-checklist.md) — every case, how to provoke it, and what was verified where.
