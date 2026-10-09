# 0008. Publish an app as a production build of one revision, served from storage

**Status:** Accepted

## Context

A preview is private and temporary: it needs a runner pod, a signed link and a signed-in member, and it stops when nobody has it open. The product also has to let one person put an app in front of anyone else - a reviewer, a friend, an admissions committee - at a link that needs no account and does not expire.

A published page is someone's code on a public address under the product's own domain. That decides most of what follows: who may do it, how much of it one person may do, where the bytes come from, and what the page is allowed to do once it is open.

## Decision

**What is published.** A production build (`npm run build`, output in `dist/`) of one saved revision of a project. The build runs in a runner pod claimed for the purpose and is deleted afterwards, never on a service (the same rule as [0003](0003-run-generated-code-only-in-runner-pods.md)). What was built is an unchangeable snapshot: later edits do not change a published app until its owner presses **Update**.

**Who may publish.** The project's owner only, through a new `PUBLISH` permission that `OWNER` alone holds. A public link carries the owner's name and responsibility; an editor can already change the code and ask the owner to press the button, and widening the rule later is one line in `ProjectRole`. Every member, a viewer included, sees that the project is published and its link - looking at what exists is part of viewing.

**How many.** One published app per project, and a limit on live apps per owner that depends on their plan: Free 1, Pro 3, Business 10 (`publishing.plan-limits`). The numbers live in workspace-service's configuration rather than in account-service's plan table because a column there would be a second schema change for a setting nobody has needed to vary; if it ever needs to move, `PlanDto` is where it goes. Builds are limited too: one at a time per project, at least 30 seconds apart, and ten an hour per person.

**The link.** `<name>.<public domain>`, one DNS label: lower-case letters, digits and hyphens, 3 to 40 characters. The name is made from the project's name plus four random characters, or chosen by the owner at the first publish. It is the same for the life of the project, across unpublish and republish, so a link someone saved keeps meaning the same app. Names that would be confusing or dangerous are refused: the product's own (`www`, `api`, `app`, `singularity`, ...), anything that looks like a preview hostname (`p<digits>-...`), and names that are not valid labels. The name is unique across the whole table.

**The record.** One table, `published_apps`, one row per project that has ever been published: its name, what is live (revision, storage prefix, size, who and when), the build in progress or the last one that failed (step, pod, heartbeat, failure kind, message and the tail of its log), and one prefix waiting to be deleted. Unpublishing keeps the row, so the name stays the project's.

**Where the bytes live.** A dedicated bucket, `published-apps`, laid out as `<name>/current.json` (a pointer), `<name>/b<N>/site/...` (the build) and `<name>/b<N>/src/...` (the sources it was built from, for the share page). Each build gets a new prefix, and the pointer is written last: that one small write is what makes an update atomic, and removing it is what takes an app down. The old build's prefix is deleted a couple of minutes later, so a request already in flight does not meet a half-removed app.

**Who serves it.** The preview proxy, which already answers every wildcard hostname. A hostname that is not a preview's (`p<digits>-...`) is a published app: the proxy reads the pointer from storage (cached for a few seconds), then the file, with a read-only MinIO user, and never talks to Redis, a database or a service for it. It needs no token. A path with no file behind it falls back to `index.html` when it looks like a page of the app and is a plain 404 when it looks like a file, so a refresh on any route works and a missing image is not a blank page.

**What a published page may do.** It is served with strict headers (a content security policy that allows the app's own scripts and nothing inline, no framing except by the product, `nosniff`, no referrer, a permissions policy that turns off the camera, microphone, location and payment, and `noindex`), never with a cookie of its own, and never with any access to the product's. A small "Built with Singularity" mark is added to its HTML by the proxy, so the page cannot remove it. See [the shared-domain review](../security-model.md#published-apps-and-the-shared-domain).

**Sharing the code.** The owner may also share a published app's code. The share page (`/p/<name>`) is public and read-only: the sources of the live build and the app itself, and a Fork button for anyone signed in. It is what the long-stored and unused `isPublic` flag now means, and it is off by default and switched off again by unpublishing. Environment files never enter the snapshot.

## Consequences

- Publishing needs the same cluster previews do. Without one, publishing fails with a plain sentence and nothing else is affected.
- A build costs a runner for its length (a minute or two with the pre-installed packages), so publishing competes with previews for the pool. A build that finds no free runner waits for one for a short while and then fails as "try again in a moment".
- Published apps are static and browser-only, like the previews they come from: no server, no database, no secrets. Anything in the code, including a key typed into it, is public the moment it is published; the panel says so.
- Old builds are not kept, so there is nothing to roll back to. Custom domains, passwords, analytics and version history are not built.
- On the production domain published apps and the product share a registered domain (the free wildcard certificate covers one level). The mitigations are in the security model, and moving apps to a domain of their own is a configuration change, not a code change: `publishing.public-domain`, the proxy's `PUBLISHED_DOMAIN` and one tunnel hostname.
- A crash in the middle of a publish can leave an unreferenced build prefix behind. Nothing serves it; cleaning storage is out of scope, as it is for revision blobs.
