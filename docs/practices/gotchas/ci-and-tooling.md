# Pitfalls: CI and Tooling

## Tailscale OAuth clients need the `auth_keys` scope

- **Symptom:** the "join the tailnet" step retries a few times with `403: calling actor does not have enough permissions`, then **passes** — and the deploy can't reach the cluster. `tailscale status` reports `Logged out`.
- **Cause:** an OAuth client with only `devices:core` can't mint the auth key a CI node needs; the action retries and exits successfully anyway.
- **Fix:** create the OAuth client with **Auth Keys: Write** and a tag (`tag:ci`). Verify connectivity with a real call (the deploy job retries `kubectl get --raw=/livez`) rather than trusting the step's result.

## A job that doesn't declare its environment sees no variables

- **Symptom:** a deployed frontend says "Firebase sign-in isn't configured", although every `VITE_FIREBASE_*` variable is set in GitHub.
- **Cause:** environment variables and secrets are visible only to jobs that declare `environment: production`. Without it, `vars.*` resolve to empty strings with no error.
- **Fix:** declare the environment on every job that reads its values, including image builds that bake values in.

## New GHCR packages may be private

- **Symptom:** a deploy can't pull a freshly pushed image.
- **Cause:** GitHub Container Registry can create a new package as private even when the repository is public.
- **Fix:** in the package's settings, change its visibility to public (once per image).

## MinIO's own images are no longer public

- **Symptom:** `RevisionPublisherIntegrationTest` fails in CI with `unauthorized: access to the requested resource is not authorized` while pulling MinIO, and a fresh node or kind cluster can't start MinIO or any `mc` container.
- **Cause:** MinIO stopped serving its images anonymously from both `quay.io/minio/*` and Docker Hub's `minio/*`. A node that pulled them earlier keeps working from its cache, which hides the problem until something needs a fresh pull.
- **Fix:** every reference uses this repo's public GHCR mirror, `ghcr.io/divyanshu2805/minio` and `ghcr.io/divyanshu2805/mc`, with the upstream tags and both `linux/amd64` and `linux/arm64`. The images are unmodified upstream builds (AGPL-3.0; source at github.com/minio/minio and github.com/minio/mc). To move to a newer MinIO release, build it from that source for both platforms and push it to the mirror first.

## Operator scripts act on the current `kubectl` context

- **Symptom:** a script meant for one cluster changes another.
- **Cause:** `deploy/scripts/apply-secrets.sh` uses whatever context `kubectl` points at and rewrites every Secret.
- **Fix:** always pass `--context` explicitly, keep production and local kubeconfigs separate, and test such scripts with a stand-in `kubectl` on the `PATH` and `KUBECONFIG` pointing at a file that doesn't exist. `restore-backup.sh` refuses to run without an explicit `--context`.

## Git Bash rewrites leading slashes

- **Symptom:** `kubectl exec … /bin/sh` or `kubectl run --command -- /bin/sh` fails with "no such file" when run from Git Bash on Windows.
- **Cause:** MSYS converts an argument starting with `/` into a Windows path (`C:/Program Files/Git/usr/bin/sh`).
- **Fix:** prefix the command with `MSYS_NO_PATHCONV=1`. Windows-native `kubectl` also can't read Git Bash `/tmp/...` paths; use a Windows path.

## The `mc` image is minimal

- **Symptom:** a script that works in a normal shell fails inside the MinIO client container.
- **Cause:** the `mc` image has no `awk` or `sed` (only shell built-ins plus `cut`, `tr`, `wc` and `date`), and `mc alias set` rejects a secret key shorter than 8 characters before contacting the server.
- **Fix:** write scripts for that image against those tools only, as the backup and restore scripts are.

## No JDK HTTP client will send a Host header that differs from the address

- **Symptom:** a test that reaches the preview proxy through a port-forward on `127.0.0.1` cannot make it route: the proxy picks the runner by `Host`, and the client either refuses to set the header or silently sends the address instead.
- **Cause:** `java.net.http.HttpClient` treats `Host` as restricted, and resolving `p12-abc.localhost` is left to the operating system, which does not treat `*.localhost` the same everywhere.
- **Fix:** write the request over a plain `Socket` (`PreviewPipelineIT.get`). It is twenty lines for a GET and depends on nothing.

## A page the proxy rewrites must not be cacheable

- **Symptom:** after a change to the script the preview proxy injects, a preview on a hostname the browser has seen before goes on behaving the old way - the address shows, back and forward stay grey, a typed address does nothing - while a fresh project works.
- **Cause:** the dev server sends its HTML with an ETag. The browser revalidates, the dev server answers "not modified", and the browser shows its cached copy, which carries whatever was injected into it when it was cached. A project keeps its preview hostname across restarts, so the cached copy outlives the proxy that made it.
- **Fix:** the proxy strips `If-None-Match` and `If-Modified-Since` from a page load and sends the rewritten page with no validator and `Cache-Control: no-store` (`proxy/index.js`). `PreviewPipelineIT` asks for the page with both headers and expects it whole. Anything that rewrites a response on the way out owns its caching too.

## `rollout undo` goes back one release whether or not this deploy touched the service

- **Symptom:** a deploy fails early - a missing secret, say - and production is found running the release before the last one, on every service.
- **Cause:** the rollback step ran on any failure in the job and called `kubectl rollout undo` on every Deployment. Undo means "the revision before the current one"; for a Deployment the failed run never changed, that is a real, older release.
- **Fix:** the revision of each Deployment is written down immediately before the apply, and on failure only those now at a different revision are rolled back, to the recorded number (`deploy/scripts/deploy-revisions.sh`). With no record there is nothing to undo. Test such a script against a stand-in `kubectl`, as that one was.

## A workflow-level permission is every job's permission

- **Symptom:** none, until a dependency's install script goes looking.
- **Cause:** `packages: write` was granted at the top of the workflow, so the test jobs - which run `npm ci` and Maven with their install scripts - held a token that could push images, and `actions/checkout` leaves that token in the workspace's git config.
- **Fix:** the workflow is read-only by default and each image build asks for `packages: write` itself. A value typed into a manual run (the commit to deploy) is checked for its shape and read from the environment, never interpolated into a script: it went into a `sed` expression, and `sed` has a command that runs a shell.

## With path conversion off, Git Bash's own curl cannot write to `/dev/null`

- **Symptom:** a script that sets `MSYS_NO_PATHCONV=1` waits for a service with `curl -o /dev/null ...` and never sees it come up on Windows, though the service is answering. On Linux the same script is fine.
- **Cause:** Git Bash's `curl` is a Windows program. Normally the shell rewrites `/dev/null` to `nul` for it; with conversion off it is handed `/dev/null` as a file name, cannot open it, and exits non-zero whatever the server said.
- **Fix:** let the shell do the discarding: `curl -fsS "$url" > /dev/null 2>&1` (`e2e/stack.sh`). The same goes for any path given to a Windows program as an argument once conversion is off.

## A bare `/login` argument becomes a Windows path

- **Symptom:** a Node script given `/login` as an argument from Git Bash receives `C:/Program Files/Git/login`.
- **Cause:** the same rewriting as above, applied to anything that looks like a path.
- **Fix:** take whole addresses instead of paths (`e2e/lighthouse.mjs`), or run that one command with `MSYS_NO_PATHCONV=1`.

## A fresh database beside a used preview namespace

- **Symptom:** a test stack started again with a new database shows a brand-new project files it never wrote, or its preview never comes up, on some runs and not others.
- **Cause:** project ids come from the database, and the namespace is full of things named after them: stored files under `projects/<id>/`, runner pods labelled with the id, routes. A new database counts from 1 again, and project 1 inherits whatever an earlier project 1 left.
- **Fix:** the database and the namespace are one unit. `e2e/stack.sh` gives each pairing a random name, kept in a ConfigMap in the namespace and as a label on the Postgres container; it reuses the two only when they agree and otherwise makes both again. Anything else that stands a database up beside an existing namespace needs the same rule.

## Naming a library as its own bundle file can put React inside it

- **Symptom:** after adding `manualChunks` to split the code editor and the charts out of the project view, every page - the landing page included - downloads the charts. `index.html` preloads them.
- **Cause:** a module no rule names goes into whichever named file needs it first. React, left unnamed, was placed inside the Markdown and charts files, so the entry point had to load those to get React.
- **Fix:** name React as a file of its own (`VENDOR_CHUNKS` in `frontend/vite.config.ts`). After changing that list, build and check that `dist/index.html` preloads only `react`.
