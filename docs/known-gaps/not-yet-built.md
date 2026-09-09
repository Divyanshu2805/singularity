# Not Yet Built

Known missing features and open items, grouped by area.

## AI generation

- **No feedback from a failed build.** If generated code fails to install or start in its preview, nothing feeds that failure back into another AI turn automatically. The model only self-corrects within a single turn (see [in-turn recovery](../architecture/flows/ai-generation.md#in-turn-recovery)).
- **No offline mode for development.** Every generation, idea-clarifier and code-insight call reaches OpenRouter and spends real tokens; there is no fixture-replay or stub provider. See [working without AI calls](../local-development/without-ai.md).
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
