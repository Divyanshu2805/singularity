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
- **Suggested next steps cost a small call each.** After a turn that saved files the browser asks for three suggestions; they are not stored, so a reload does not bring them back.
- **The design decisions carried between turns belong to one person's conversation.** A collaborator's turns do not see them.
- **The scripted model knows one app.** The `stub-ai` profile answers every call without a provider, but its build is always the same notes app and one follow-up change. See [working without AI calls](../local-development/without-ai.md).
- **Build validation is off by default.** `RevisionBuildValidator` works, but every run is a cold `npm install` with no shared cache, and it can report only one flat diagnostic string. See [validation before publish](../architecture/file-revisions.md#validation-before-publish).

## Files and revisions

- **No revision history in the UI.** The list, preview-restore and restore endpoints exist but the frontend doesn't call them.
- **No manual editing path.** `RevisionSource.MANUAL_EDIT` is supported end to end, but nothing produces it.
- **No blob garbage collection.** Content blobs are never deleted, so storage grows monotonically.
- **No crash recovery mid-publish.** A process crash between apply steps leaves a revision in `STAGING` with no automatic reconciliation.

## Collaboration and permissions

- **Single-owner invariant not enforced.** Nothing prevents inviting or promoting a second `OWNER`.
- **`isPublic` isn't used.** The flag is stored, but every project read still requires membership.
- **Denied project page looks empty.** A non-member who opens a project URL is denied its data but sees the normal empty build screen, instead of a clear "not available" message.
- **Chat sessions can't be deleted.** `ChatSession` has a soft-delete column, but no endpoint deletes one.

## Platform

- **Previews support one stack** (React + Vite). See [constraints](constraints-and-trade-offs.md#previews-are-single-stack).
- **No static publishing.** A project can be previewed live but not published as a stable static site.
- **The frontend is a single bundle.** There is no route-level code splitting, and the production build warns about chunk size.
