# 0010. Let a project leave: a README in every download, and a push to its owner's GitHub

**Status:** Accepted

## Context

A project may hold a server of its own ([0009](0009-a-server-in-the-preview.md)), and that server runs in the preview only. Running it behind a published link was considered and left out: a process per published app on one two-core machine, storage that outlives a pod, and a boundary strong enough for code anyone on the internet can reach. So an app that needs its server could be built here and shown to a member of the project, and to nobody else.

The other way out is for the app to leave. Its owner already could download it as a ZIP, with nothing in it to say how to run it and no way to start it as one program, which is what every host expects.

## Decision

**A project is made ready to be hosted by its owner, on their own account, and this product hosts none of it.**

**One program.** The starter template carries a launcher, `start.mjs`, and `package.json` runs it as `start`. It serves the built pages from `dist`, starts the project's server on port 3001 when the project has one, and passes every request under `/api` on to it; the host's port comes from `PORT`. It uses nothing but Node. Beside it are `tsx` among the dependencies rather than the dev dependencies, `dev:all` to run the page and the server together on one's own computer, and `engines` naming Node 22.

The launcher exists because the first design did not survive a real model. The prompt asked the model's own server to read its port from `PORT` and to serve the built pages with four lines to copy; of three servers a real run wrote, three had `const port = 3001` and none had the four lines. The launcher asks nothing of the model: a server that believes it is always on 3001 is right. A project made before the template carried it has none, and its README says it cannot be hosted as one program rather than give steps that end in pages with nothing behind them.

**A README as the project leaves.** `ProjectHandout` writes a README and a `.gitignore` for a project that has none, at the moment it is zipped or pushed. They are not stored in the project: a stored README is one more file for every build turn to keep true. It is written from the files being handed over - a server or not, and which commands `package.json` really has - and it names one host, with the two commands to give it and what a free plan does to the app's data.

**A push to GitHub.** The owner connects their GitHub account once and pushes the project to a repository the first push makes. Hosts deploy from a repository, so this is the step that turns "download a ZIP" into "it redeploys when I push".

- *Who.* Connecting is any signed-in person's own business. Pushing and forgetting the link need the `PUBLISH` permission - the owner - because a push sends every file of the project somewhere its other members do not control. Every member may see where the repository is.
- *How it signs in.* An OAuth app, the authorization-code flow, with a `state` value this service signs: the user's id, an expiry and a random part, under a key derived from the token key. It is accepted only for the same signed-in person, so a sign-in cannot be finished in someone else's session, and nothing is stored for it. GitHub sends the browser to a page of the app, not to the server: the session cookie is `SameSite=Strict` and is not sent on a navigation from another site, so the page posts the code from inside the site.
- *The scope is `repo`.* It is what GitHub requires to make a private repository, and private is the default. It is also far wider than this needs, reaching every repository the person has. The narrower tool is a GitHub App installed on chosen repositories; it was not used because its tokens expire and need refreshing, a repository it has just made is outside a "selected repositories" installation, and none of that could be tried without a registered app. The width is contained instead: the token is encrypted at rest (AES-256-GCM, key from a secret), never returned by any endpoint or written to a log, used only for the repository whose id is stored for the project, and deleted - and the grant revoked at GitHub - on disconnect.
- *How it commits.* Through GitHub's Git Data API: a tree of every file, a commit of that tree on the branch's head, and the branch moved to it without force. No `git` is run and nothing is written to this machine's disk. The tree has no base, so the repository's files become exactly the project's.
- *What is left out.* Environment files, and GitHub Actions workflows, which GitHub refuses from an app without the `workflow` scope. The answer names them.
- *Off by default.* `github.enabled` is false unless set. With it on, a missing client id, secret or key stops the service at start-up; with it off they are never read, and the header shows no GitHub button.

**It all lives in workspace-service**, the connection included. A connection is a person's and would sit naturally in account-service, but then the token would cross a service boundary on every push; here it is read in the one process that uses it.

## Consequences

- An app with a server can be given to anyone, by its owner, with nothing of this product in the path once it is pushed.
- This product now holds credentials for other people's accounts on another service. A leak of the database alone does not expose them; a leak of the database and the token key does, for every repository of every connected person. The key is the thing to protect and to rotate, and rotating it disconnects everyone.
- A push overwrites. A file changed by hand on GitHub is replaced by the project's version at the next push; the earlier one is still in the repository's history. There is no pull: changes made there do not come back.
- The repository is the owner's. Forgetting the link leaves it alone, and deleting a project does not touch it.
- A hosted app's data is a SQLite file beside the program. A free plan that does not keep files loses it at every restart. The README says so; it does not fix it.
- None of the hosting has been tried from here: the README's steps for the named host, and the push against the real GitHub, are checked by hand ([checklist](../../local-development/github-checklist.md)).
- One process, like the service's other limits: one push per project at a time and a per-person hourly limit are held in memory.
