# Not Yet Built

Known missing features and open items, grouped by area.

## AI generation

- **A fault that only shows when the app runs is not caught before saving.** Within a turn the server parses the written files, resolves their imports, and - when the project's preview is running - type-checks them in the preview pod and looks up any package the turn adds, and has the model repair what fails (see [in-turn recovery](../architecture/flows/ai-generation.md#in-turn-recovery)). Nothing runs the app, so a runtime fault is still saved; the preview shows it with a **Fix this** button that sends it to the chat. With no preview running there is no type-check either. Sending a build request now starts the preview, but a cold start can take longer than a short build, so a project's first build may still be saved unchecked.
- **The type-check reports only the files a turn wrote.** A change that breaks a file it did not touch - a prop renamed in one place and still used in another - is not reported, so that a project's older faults are not sent back on every turn.
- **A turn does not survive a hard crash.** A turn in progress lives in memory. An orderly restart records it as failed first, but a process that is killed outright loses it; the browser that asked keeps the question locally with a Retry, and another device sees nothing. Saving the question when the turn starts, rather than when it ends, would close this.
- **Which files a large project shows is a guess from the request.** Past the budget (50 files or 80,000 characters) the entry points are shown, then the files whose paths best match the request and the ones recent turns touched; the rest are read on demand. Nothing is read to rank them, so a file that matters only by its content is not preferred. What the model does read is kept in front of every later call of the turn. See [showing the project](../architecture/flows/ai-generation.md#showing-the-project).
- **The build prompt is not served from the provider's cache on the build model.** The prompt is laid out to be cached, and `gemini-3.5-flash-lite` does cache part of it, but `gemini-3.8-flash` reported none on repeated identical calls ([results](../practices/build-benchmark-results.md#the-providers-prompt-cache)). Using the provider's explicit cache would need its own integration.
- **The thought process is what the model chose to write, not its reasoning trace.** The `<approach>` block is part of the reply. Reasoning tokens a provider reports separately are not captured or shown.
- **A question midway ends the turn.** The model can build a part and then ask, and the answer starts a new turn; a turn cannot pause, wait for an answer and carry on.
- **Existing projects keep the starter they were created from.** A change to the starter template reaches new projects only. Projects made before the shadcn/ui template are daisyUI projects and are built on as such: the kit is read off the project's files (`llm/UiKit`).
- **Suggested next steps are served but not shown.** The chat used to ask for three suggestions after a turn that saved files; that was taken out of the frontend, and `POST /api/chat/projects/{id}/suggestions` is left with no caller.
- **The design decisions carried between turns belong to one person's conversation.** A collaborator's turns do not see them.
- **A project's tour does not follow the project.** It is written when its reader asks and kept as it was; the project then moves on and the tour does not notice - "Written 3 days ago" on the panel is the only sign, and writing it again is the reader's press (it spends allowance). Its glossary is the same: a word's definition and its example are written once and kept even if that code later changes. Both are per person, so two members of a project hold their own.
- **A "try changing this" task is checked by a model reading the saved file.** Nothing runs the change, so a change that satisfies the wording of "Done when" but breaks the app is judged by what the model sees in the file; the check is only as good as the model's reading. It reads the file as saved, so an edit not yet saved is "Not yet" (the answer says to press Save). A task is set only for a step of a turn built in Teach me mode, one at a time, and only on a step that has file text. A "Done" is final - changing the line back does not undo it.
- **The scripted model knows one app.** The `stub-ai` profile answers every call without a provider, but its build is always the same notes app and one follow-up change. See [working without AI calls](../local-development/without-ai.md).
- **Build validation is off by default.** `RevisionBuildValidator` works, but every run is a cold `npm install` with no shared cache, and it can report only one flat diagnostic string. See [validation before publish](../architecture/file-revisions.md#validation-before-publish).

## Files and revisions

- **Hand editing changes existing files only.** A file can be edited and saved in the workspace; creating, renaming and deleting files by hand are not built, and a save made during someone else's build can be overwritten by that build (it stays in the history).
- **The history names only your own requests.** A revision made by a collaborator's build is listed by who made it, not by what they asked, since each person's chat is their own.
- **Clearing a chat is permanent.** `DELETE /api/chat/projects/{id}` hard-deletes the caller's turns; there is no archive.
- **No blob garbage collection.** Content blobs are never deleted, so storage grows monotonically.
- **No crash recovery mid-publish.** A process crash between apply steps leaves a revision in `STAGING` with no automatic reconciliation.

## Collaboration and permissions

- **An invitation is not sent anywhere.** There is no email. The invited person sees it on their dashboard the next time they sign in with that address; the owner has to tell them.
- **Ownership cannot be handed over.** A project has exactly one owner, set when it is created or forked, and nothing transfers it.
- **`isPublic` is only the share page's switch.** It means "the code of the live published app is on the public page"; it does not make a project readable to a non-member anywhere else.
- **Denied project page looks empty.** A non-member who opens a project URL is denied its data but sees the normal empty build screen, instead of a clear "not available" message.
- **Chat sessions can't be deleted.** `ChatSession` has a soft-delete column, but no endpoint deletes one.

## Platform

- **The cluster's internal network policies are written but not switched on.** `deploy/k8s/network-policies/` restricts which pod may connect to which among the trusted workloads; it is applied by hand, because it has not been run on a cluster yet. Until it is, any pod in `singularity` can reach Postgres, MinIO and Eureka directly and is stopped only by their passwords and the internal shared secret. The runner pods are already fenced by their own policy.
- **Eureka and Redis have no passwords.** Both are reachable only from inside the cluster, and with the network policies applied only from the pods that use them. Redis holds the preview routes, so a compromised trusted pod could repoint a preview hostname.
- **The deploy does not check the API server's certificate unless it is given the cluster's CA.** The connection runs inside the tailnet; setting the `KUBE_CA_CERT` secret turns verification on ([configuration](../deployment/configuration.md)).

- **Previews support one stack** (React + Vite). See [constraints](constraints-and-trade-offs.md#previews-are-single-stack).
- **Publishing is one live version, on one link.** No custom domains, no password on a published app, no visitor analytics, no older versions to go back to, and no report button for a page someone should not have published. Published apps are static and browser-only. A crash in the middle of a publish can leave an unreferenced build in storage (nothing serves it); the sweeper removes builds it is told about, and storage is not otherwise cleaned. The limits on live apps per plan live in workspace-service's settings, not in the plan table. See [ADR 0008](../architecture/decisions/0008-published-apps.md).
- **The frontend is a single bundle.** There is no route-level code splitting, and the production build warns about chunk size.
