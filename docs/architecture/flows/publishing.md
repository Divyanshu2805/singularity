# Flow: Publishing

Publishing puts a production build of one saved revision of a project online at a stable public link that needs no account. The owner presses **Publish**; workspace-service builds the app in a runner pod of its own, stores the result in object storage, and writes one small pointer object that makes it live; the preview proxy serves it from there. The decision and its reasons are [ADR 0008](../decisions/0008-published-apps.md).

## Steps

1. **`PublishController` → `PublishServiceImpl.publish`.** Guarded by `@security.canPublishProject` (the owner only). In order: a build already running answers with itself and starts nothing; the person's hourly cap (`PublishRateLimiter`, in memory); the plan's allowance of live apps, only when this publish makes an app live (an update to one already live spends nothing); the row is created at the first publish with a link name (the owner's, validated by `PublishedSlug`, or one made from the project's title); then **the claim** - `PublishedAppRepository.claimBuild`, a conditional update that applies only when no build is running and the last started at least `publishing.min-build-interval` ago. Whoever wins starts `PublishBuilder.run` off the request thread. Starts are serialized per person in memory so two presses cannot both pass the allowance check.
2. **`PublishSourceReader` reads the files at one revision.** It reads the project's current revision, every file, then the revision again; if it moved, it reads again (three tries, then an error). It reads the live layout and not the revision's manifest, because a revision is a delta chain that does not hold the starter template's untouched files. `node_modules/`, `.git/` and `dist/` are left out; the file count and total size are bounded.
3. **A runner pod is claimed for the build** (`PreviewRunnerPool.claim`), waiting up to `publishing.runner-wait` when every one is busy. Never a pod already serving a preview. The pod's name is written on the row, which is what stops `PreviewReaper`'s orphan sweep releasing it after two minutes.
4. **The project goes in, the build runs.** The files are packed into one tar, uploaded as `/tmp/project.tar` and unpacked in `/app`; then `npm install`, then `CI=true npm run build`, each under its own time limit with a second thread keeping the row's heartbeat fresh. The result must have `dist/index.html`; its size is checked in the pod before anything is read out.
5. **The build comes back as one tar** (`PreviewRunnerPool.execForBytes`, bounded), read by `util/TarArchive` under limits on file count, total size and size of one file. Only regular files are taken: a link is ignored, never followed, and every name goes through `ProjectFilePath`.
6. **It is stored, then pointed at.** `PublishedStore` writes the build under `<name>/b<N>/site/`, the sources it was built from (environment files removed) under `<name>/b<N>/src/`, and **last** `<name>/current.json`. Then `markLive` records it in the database. The pod is released whatever happened.
7. **`proxy/published-server.js` serves it.** See [serving](#serving).

If the build is ended from outside - Unpublish, the project's deletion, the sweeper - every write the builder makes names its build number and applies only while that build is still the one under way, so it finds out at its next step, deletes what it stored and stops. It can never put a pointer live over what replaced it.

## The record

One row per project in `published_apps` ([schema](../../schema/workspace-service.md#published_app)): the link name, whether anything is served, what is live (revision, storage prefix, size, who, when), the build under way or the last one that failed, and one old prefix waiting to be deleted. Live and build are separate groups of columns on purpose: **an update that fails leaves the live app exactly as it was**, and the panel says so.

The state the panel shows (`PublishResponse`) is derived, not stored: `hasChanges` is the project's current revision against the live build's. The link name is chosen once and kept through unpublish and publish again.

## Serving

A hostname that is one DNS label under `PUBLISHED_DOMAIN` and not shaped like a preview's (`p<digits>-...`) is a published app. The proxy:

- reads `<name>/current.json` from the published-apps bucket (cached five seconds, three for "missing") with a read-only MinIO user that can read only `current.json` and `site/` files - not the `src/` snapshot, not any other bucket - and never talks to Redis, a database or a service;
- maps the path to the files to try, in order: the file itself; for a path with no extension also `<path>.html`, `<path>/index.html` and finally `index.html` (the single-page fallback, so a refresh on any route of the app works); a path with an extension has no fallback, so a missing image is a 404 and not a blank page;
- refuses a path with a dot segment, a backslash, a NUL or a control character before it becomes a key, so no request can name another app's files or the stored sources;
- takes the content type from a fixed table by extension, never from storage; hashed bundler output (`assets/name-<hash>.ext`) is cached for good and everything else is `no-cache`; conditional requests and ranges go through to storage; HTML gets the "Built with Singularity" mark added and is never cached;
- tells outcomes apart: no pointer is "this app isn't published" (404), a missing file is "page not found" (404), storage not answering is a 503 with `Retry-After` - an outage is never shown as "not published";
- puts the strict headers on every response, errors included ([security model](../security-model.md#published-apps-and-the-shared-domain)).

An update is atomic because the pointer is one object written after the files; the old build's prefix is deleted a couple of minutes later, so a request already in flight does not meet a half-removed app, and a request that finds the cached prefix gone reads the pointer again once.

## Taking an app down

Unpublish and a project's deletion remove the **pointer first** - the one object the proxy serves from - then change the row, so a storage failure leaves the app visibly published and the call repeatable, never online while the record says it is not. Deleting the project (`ProjectServiceImpl.softDelete`, owner) calls `PublishService.takeDown`, after the project's own delete has been flushed and its previews stopped. Unpublishing also switches the sharing of the code off.

`PublishSweeper` (every 20 seconds) finishes the rest: it fails a build whose heartbeat has stopped (the platform's failure, so the panel offers to try again unchanged), and for a row with a retired prefix deletes every build the app has in storage except the live one and the one being made - and, for an unpublished app, the pointer again.

## When a publish fails

Every failure is recorded with a kind (`PublishFailureKind`), one plain sentence and the tail of the output (`failure_log`, read back by `GET .../publish/log`, owner only).

| Kind | What happened | The panel |
|---|---|---|
| `INSTALL` | `package.json` cannot be installed | The sentence; "Show output" |
| `BUILD` | The project's code does not build: no `build` script, an import that cannot be found, a syntax or type error | The sentence naming the file; "Show output" |
| `NO_OUTPUT` | It built but left no `dist/index.html` | Says the build must write to `dist` |
| `TOO_LARGE` | The sources or the build are over the limits, or the build ran out of memory | Says to remove large files |
| `TIMEOUT` | A step ran out of time | Offers to try again |
| `CAPACITY` | No runner came free within `publishing.runner-wait` | "Not your app's fault - try again" |
| `PLATFORM` | The cluster, storage or the service failed, or the service restarted mid-build | "Not your app's fault - try again" |

`util/PublishFailureExplainer` turns npm's and the bundler's output into the sentence and the cause. It matters that a registry timeout or a full disk comes out as `PLATFORM`: reported as `INSTALL` it would be blamed on the project.

## Sharing the code

The owner may switch **Share the code** on for a live app. That is `projects.is_public`, set by `PUT .../publish/sharing`; it is off by default and switched off again by unpublishing. The public page `/p/<name>` (`frontend/src/pages/SharedApp.tsx`) reads three anonymous endpoints (`PublicAppController`): the app, its file list and one file at a time, all from the sources stored with the live build - never the project's current files, so work in progress is never on show. **Fork** needs a signed-in caller, counts against their project allowance (`ProjectQuota`), and copies the snapshot's files into a new project with a server-side copy; a copy that loses a file deletes the fork again. Every way the app can be unavailable - not published, unpublished, not shared, deleted - answers with the same "not found".

## Related

- [Publishing API](../../api/publishing.md).
- [Running and verifying publishing locally](../../local-development/publishing.md), and [the checklist](../../local-development/publish-checklist.md).
- [Live preview flow](live-preview.md) - the runner pool and the proxy this builds on.
