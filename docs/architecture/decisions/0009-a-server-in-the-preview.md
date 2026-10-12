# 0009. Let a project hold a small server, run beside the dev server in its preview

**Status:** Accepted

## Context

Every project was a React app that ran in the browser and nowhere else, and the build prompt said so: asked for anything that needed a server, the model built the front end and kept its data in `localStorage`. That ruled out two things the product is for. A person could not build something two people use from their own screens - a game with a friend, a shared list, a leaderboard. And a learner, whose project is the thing the lessons are about, never saw a route, a table or a query: the teaching stopped at the edge of the browser.

The preview already runs untrusted, generated code in a runner pod, with Node installed and the project's packages beside it. A second process there needs no new place for code to run.

## Decision

**What a project may hold.** A folder `server/` beside `src/`. `server/index.ts` is the entry: an Express 5 app whose routes all start with `/api/`, listening on `PORT` (3001). Its database is SQLite through Node's own `node:sqlite` module, in the file `.data/app.db`. One of each, named in the build prompt, because a model left to choose reaches for an ORM, a hosted database or a WebSocket library that the runner does not have. A project has a server when that entry file exists; nothing else marks it.

**Where it runs.** In the runner container of the project's preview pod, started by the same boot script as the dev server and in the same process group, so stopping the dev server stops it. A loop waits for the entry file and for `tsx`, which runs it; a project that gains a server while its preview is running gets one without a restart. The loop does the watching itself - one checksum of everything under `server/`, once a second - and starts the server again when it moves. A server that dies is started again after five seconds, not at once, so one that cannot start does not spin. This is [0003](0003-run-generated-code-only-in-runner-pods.md) kept, not bent: it is generated code, and it runs where generated code may.

**How the page reaches it.** Through the dev server. The starter template's `vite.config.js` proxies `/api` to `127.0.0.1:3001`, so the page calls `fetch("/api/...")` on its own origin, the preview proxy and its access token are unchanged, and the runner pods' network policy still admits one port. The server is reachable only from inside its own pod.

**What the starter template carries.** `express`, `tsx` and `@types/express` in `package.json`, a `server` script, the `/api` proxy, and `server` in `tsconfig.json`'s `include` so the turn's type-check reads server files too. No server file: most apps need none, and the prompt says when to build one - data that people share, or a backend the person asks for - and when not to. A project made before the template carried those lines is told by the prompt to add them.

**The runner image is Node 22.** `node:sqlite` needs it. A database as a package would have been a native module compiled or downloaded at install time, on two CPU architectures, inside a pod with no compiler.

**The database is the pod's.** `.data/` is excluded from the copy that brings the project's files into the pod; that copy removes whatever storage does not hold and would delete the database on every edit. So the data lasts as long as the runner: it survives edits and a reinstall, and starts empty when the preview is stopped, goes idle or loses its pod.

**A changed table starts the data again.** Tables are made in `server/db.ts` with `CREATE TABLE IF NOT EXISTS`, which does nothing to a table that already exists; a turn that adds a column would leave a running preview with the old table and every query naming the new column failing. The loop keeps the checksum of that one file beside the data and removes the data when it differs. The build prompt says the same from the other side: change the `CREATE TABLE`, never write `ALTER TABLE` or a migration, and say the saved data was cleared. Migrations are the real answer for data that matters; this data does not outlive its runner anyway, and a learner's first server should not need them.

**Publishing is unchanged.** A published app is still the production build of the pages, served from storage. Its server is not built, started or reachable there; the Publish panel says so for a project that has one. What such a project's owner can do instead is in [0010](0010-push-a-project-to-github.md).

## Consequences

- A learner can read, change and be taught about a route and a query in their own project; lessons, the tour and the glossary read `server/` files as they read any other.
- Two members of a project share one runner, so they share its server and its data.
- Data is not durable. There is no backup of it and no way to see or export it but through the app's own routes.
- A published app that depends on its server shows its pages and fails at the first request to `/api`. Running a server behind a published link needs a process per published app, storage that outlives a pod, and a stronger boundary than a preview needs, since that code would be reachable by anyone; it is a separate decision ([not yet built](../../known-gaps/not-yet-built.md)).
- The server is watched less closely than the dev server: a start does not wait for it, and the reaper's health check does not ask it. A server that fails to start shows in the preview's output, and the page's own error state is what the person sees.
- Two people watching the same thing change is done by asking again every second or two. The `/api` proxy carries no WebSocket.
- Sign-in with passwords, payments, email and anything that needs a secret are still not built: there is nowhere to keep a secret that the project's own files, the share page and a fork would not show.
