# Known gaps

What isn't built yet, and API behaviour that looks like a bug but isn't. The bigger structural limits (single node, per-process state, one preview stack) are in [constraints and trade-offs](constraints-and-trade-offs.md).

## Not built yet

### AI generation

- **Runtime faults aren't caught before saving.** A turn's files are parsed, their imports resolved and, when the preview is running, type-checked in the preview pod ([in-turn recovery](../architecture/flows/ai-generation.md#in-turn-recovery)). Nothing actually runs the app, so a runtime error is saved, and the preview offers **Fix this** for it. With no preview running there's no type-check. A build request starts the preview, but a cold start can lose the race with a short build, so a first build can still be saved unchecked.
- **The type-check only reports files the turn wrote.** Renaming a prop in one file and leaving a stale use in another isn't caught. That's deliberate, so older faults aren't sent back on every turn.
- **A hard crash loses the turn in progress.** An orderly shutdown records it as failed, but a killed process doesn't. The browser keeps the question with a Retry button, and other devices see nothing.
- **In a big project, which files the model sees is a guess.** Past 50 files or 80,000 characters the brief shows entry points, then files whose paths match the request and ones recent turns touched. The rest are read on demand ([showing the project](../architecture/flows/ai-generation.md#showing-the-project)).
- **The build model doesn't hit the provider's prompt cache.** `gemini-3.5-flash-lite` caches part of the prompt and `gemini-3.8-flash` caches none of it ([results](../practices/build-benchmark-results.md#the-providers-prompt-cache)).
- **The "thought process" is the `<approach>` block the model writes**, not its hidden reasoning trace.
- **A question asked midway ends the turn.** The answer starts a new one.
- **Old projects keep their starter.** Projects made before the shadcn/ui template stay daisyUI, and the prompt picks the kit from the project's files (`llm/UiKit`).
- **Suggested next steps have no caller.** The endpoint (`POST /api/chat/projects/{id}/suggestions`) is still there, but the UI no longer asks for them.
- **Design decisions carried between turns are per person.** A collaborator's turns don't see yours.
- **The project tour and glossary don't follow the code.** They're written once, when asked for, and the panel shows their age. Rewriting costs allowance. Both are per person.
- **A "try changing this" task is checked by a model reading the saved file**, not by running it. Unsaved edits count as "Not yet", and a "Done" stays done.
- **The scripted model (`stub-ai`) knows one app**: the notes app and one follow-up ([working without AI](../local-development/without-ai.md)).
- **Pre-publish build validation is off by default.** `RevisionBuildValidator` works, but each run is a cold `npm install` ([validation before publish](../architecture/file-revisions.md#validation-before-publish)).

### Files and revisions

- No rename or move by hand. Renaming is add-then-delete, and folders only exist as path prefixes.
- A hand save made during someone else's build can be overwritten by that build. It stays in the history.
- The history shows a collaborator's revisions by author, not by what they asked, since chats are per person.
- Clearing a chat hard-deletes it.
- Content blobs are never garbage-collected.
- A crash mid-publish leaves a revision in `STAGING` with nothing to reconcile it.

### Collaboration

- Invitations aren't emailed. The invitee sees a notice on their dashboard the next time they sign in with that address.
- Ownership can't be transferred.
- `isPublic` only controls whether the published app's code shows on its share page.
- A non-member opening a project URL gets an empty build screen rather than a clear "not available".
- Chat sessions can't be deleted.

### Platform

- **The trusted-pod network policies are applied by hand.** `deploy/k8s/network-policies/` has been on in production since 2026-10-10 and is proven on kind (`deploy/scripts/check-network-policies.sh`), but the deploy doesn't apply it, so a cluster built from scratch won't have it.
- **Eureka and Redis have no passwords.** Only the network policies keep other pods off them. Redis holds preview routes, so a compromised trusted pod could repoint a preview hostname.
- **The deploy skips API-server certificate checks** unless `KUBE_CA_CERT` is set. The connection runs inside the tailnet ([configuration](../deployment/configuration.md)).
- **Previews support one stack**: React + Vite, with an optional Node server ([constraints](constraints-and-trade-offs.md#previews-are-single-stack)).
- **A project's server only runs in its preview.** A published app is static, so one that calls `/api` fails there, and the Publish panel warns about it. Server data doesn't outlive the runner, and changing a table clears it.
- **A project's server isn't health-checked after saving.** It's started once before the turn is saved (when a preview is running). After that, failures only show in the preview's output.
- No WebSockets to a project's server. No sign-in, payments, email or secrets in generated apps.
- **GitHub push is one-way and overwrites.** No pull, no other branches, and the first push always makes a new repo. The `repo` scope is wider than ideal, and [ADR 0010](../architecture/decisions/0010-push-a-project-to-github.md) explains why. A connection lasts until Disconnect, or until GitHub rejects the token.
- **Publishing is one live version on one link.** No custom domains, passwords, analytics, rollback or abuse reports. A crash mid-publish can leave an unreferenced build in storage. Per-plan app limits live in workspace-service's settings, not the plan table ([ADR 0008](../architecture/decisions/0008-published-apps.md)).

## API behaviour worth knowing

- **A project that doesn't exist is `403`, not `404`.** `@PreAuthorize` runs before not-found handling, so a missing project looks like one you're not in. This also avoids confirming which ids exist. The internal API differs: `GET /internal/v1/projects/{id}/members/{userId}` answers `404` for a missing project and `200` with `role: null` for a non-member.
- **A deleted project is `404` to its former members.** Deleted rows are filtered out in the query.
- **`402` means "your plan can't".** The request was valid. `DAILY_TOKENS`, `PROJECT_LIMIT` and `PREVIEW_LIMIT` are all checked before any work starts, and the `quota` body says which limit was hit and when it resets.
- **Someone else's note is `404`.** Notes are looked up scoped to the caller.
- **The old auth endpoints return `401`.** `/api/auth/signup`, `/login`, `/forgot-password` and `/reset-password` are rejected by the security chain before routing finds there's no handler.
- **Preview URLs change on every poll.** Each response carries a freshly signed token, so compare `id` and `status`, not the URL.
- **Usage days follow the server's time zone.** The daily allowance resets at the server's midnight, which `resetsAt` reports.
