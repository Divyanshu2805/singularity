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
