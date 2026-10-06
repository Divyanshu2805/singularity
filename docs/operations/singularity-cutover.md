# Rename cutover: VibeCraft to Singularity

A one-time runbook for moving production and local development from the old `vibecraft` names to `singularity`. **Delete this file once the cleanup in step 9 is done.**

The rename changes Kubernetes namespaces, the Postgres role and database names, container image names and the public hostname. Kubernetes cannot rename a namespace, and Postgres and MinIO data cannot move between namespaces, so production is **rebuilt in new namespaces** rather than renamed in place. All existing production data (databases and stored project files) is discarded; that was an explicit decision. Firebase accounts and Stripe test data live in those services and survive.

## What changed, and what deliberately did not

| Old | New |
|---|---|
| namespaces `vibecraft`, `vibecraft-ai` | `singularity`, `singularity-ai` |
| Postgres role `vibecraft`; databases `vibecraft-{account,workspace,intelligence}-db` | role `singularity`; `singularity-{account,workspace,intelligence}-db` |
| images `ghcr.io/divyanshu2805/vibecraft-*` | `ghcr.io/divyanshu2805/singularity-*` |
| `vibecraft-proxy`, `vibecraft-proxy-svc`, `k8s/vibecraft-proxy.yml` | `singularity-proxy`, `singularity-proxy-svc`, `k8s/singularity-proxy.yml` |
| `vibecraft.divyanshuagrahari.dev` | `singularity.divyanshuagrahari.dev` (old name still routed for now) |
| local containers `pgvector-vibecraft`, `minio-vibecraft` | `pgvector-singularity`, `minio-singularity` |
| runner-pod annotation `vibecraft.dev/claimed-at` | `singularity.dev/claimed-at` (both are written and read for now) |

Kept as they are, because they live outside this repository or cannot be renamed:

- The old Firebase project `vibecraftai-5ac98` (project ids are immutable). It is replaced by two new projects, `singularity-dev0` (local development and the kind overlay) and `singularity-prod0` (production, patched in the `oracle` overlay); delete the old one at cleanup.
- The old Cloudflare R2 bucket `vibecraft-backups` (bucket names are immutable). Backups now go to a new bucket, `singularity-backups`, with its own API token; delete the old bucket and token at cleanup.
- The Tailscale machine name `vibecraft-k3s` (rename it in the Tailscale admin console if you want; nothing in the code depends on it).
- `account-service`'s `V1__init.sql`, which mentions the old package name in a comment. Flyway checksums comments, so editing an applied migration stops the service from starting.
- The local checkout folder. Docker Compose derives its volume names from the folder name, so renaming it makes your local data look like it vanished.

## Production

Downtime runs from step 4 to step 7. Everything before step 4 changes nothing for users.

### Before you start

1. **Cloudflare.** `singularity.divyanshuagrahari.dev` must reach the tunnel. The `*` wildcard record normally covers it; confirm it resolves, and add a proxied CNAME to the tunnel (`<tunnel id>.cfargotunnel.com`) if it does not. Cloudflare's free certificate already covers one subdomain level.
2. **Firebase.** The new *production* Firebase project must already exist, with Google and Email/Password enabled and `singularity.divyanshuagrahari.dev` under Authorized domains. The old project stays untouched until cleanup.
3. **Open the pull request** and let CI run its tests. Pull requests never deploy. Do not merge yet.

### Cutover

4. **Stop the old stack, without deleting it.** This keeps a way back, frees the node's two CPUs, and stops the old `cloudflared` from sharing the tunnel with the new one and sending half of the requests to services that no longer exist. Use a privileged kubeconfig:

   ```bash
   kubectl --context <prod> -n vibecraft patch cronjob nightly-backup -p '{"spec":{"suspend":true}}'
   kubectl --context <prod> -n vibecraft scale deployment --all --replicas=0
   kubectl --context <prod> -n vibecraft scale statefulset --all --replicas=0
   kubectl --context <prod> -n vibecraft-ai scale deployment --all --replicas=0
   kubectl --context <prod> -n vibecraft-ai delete pod --all
   ```

   The last line matters: claimed runner pods are detached from their Deployment, so scaling it to zero does not remove them.

5. **Bootstrap the new namespaces and deploy identity** (once, with the same privileged kubeconfig):

   ```bash
   kubectl --context <prod> apply -k deploy/k8s/namespaces
   kubectl --context <prod> apply -f deploy/k8s/overlays/oracle/deployer-bootstrap.yaml
   ```

   Then put the new token in the `KUBE_DEPLOYER_TOKEN` GitHub secret:

   ```bash
   kubectl --context <prod> -n singularity get secret deployer-token -o jsonpath='{.data.token}' | base64 -d
   ```

   The token is a credential: paste it straight into GitHub and don't share the terminal output.

6. **Point the app at the new hostname and the new production Firebase project.** In GitHub, Settings, Environments, `production`: set the variable `APP_DOMAIN` to `singularity.divyanshuagrahari.dev`; set the four variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` from the production project's web app; and replace the secret `FIREBASE_SERVICE_ACCOUNT_JSON` with the production project's service-account key. The frontend image bakes the variables in, so set them before merging. Every environment's `firebase-project-id` must name the same project as its web config and key, or sign-in fails with a token-audience error.

7. **Merge the pull request and deploy.** CI runs its tests, then builds and pushes the eight images under the new names, then pauses at the `approve` job.

   - **While it is paused, make the eight new GHCR packages public** (GitHub profile, Packages, each `singularity-*` package, Package settings, Change visibility). New packages can start private, and a private image fails to pull. Approve the deploy only after that.
   - Approve. The deploy applies the secrets and the `oracle` overlay into the new namespaces and runs the smoke test. Postgres, MinIO and Redis start empty; account-service seeds the plans on its first start.

### Verify

8. In a browser, on `https://singularity.divyanshuagrahari.dev`: sign in with Google, create a project, let the AI write a file, and **start a live preview**. The preview exercises the new namespace, the runner pool, the proxy, MinIO and the preview token end to end. Then take a backup by hand and confirm it landed:

   ```bash
   kubectl --context <prod> -n singularity create job --from=cronjob/nightly-backup backup-manual-1
   ```

   Update the Stripe webhook endpoint (test mode) to `https://singularity.divyanshuagrahari.dev/webhooks/payment`. The old URL keeps working until step 10.

### Cleanup

9. **Only once step 8 is fully green**, delete the old namespaces. This permanently deletes the old databases and stored files:

   ```bash
   kubectl --context <prod> delete namespace vibecraft vibecraft-ai
   ```

10. **Later, as separate commits**, once nothing uses the old names:
    - Delete the three `TRANSITION` rules in `deploy/k8s/overlays/oracle/cloudflared-config.yaml`, ideally after adding a Cloudflare redirect from the old hostname to the new one.
    - Remove `LEGACY_CLAIMED_AT_ANNOTATION` and its write and read in `PreviewRunnerPool`, once no older version can be rolled back to.
    - Delete the old `vibecraft-*` GHCR packages.

### Rolling back

Before step 9, the old namespaces still exist, scaled to zero:

1. Revert the merge, and set `APP_DOMAIN` back to the old hostname.
2. Re-apply the **old** `deployer-bootstrap.yaml` (`git show <old sha>:deploy/k8s/overlays/oracle/deployer-bootstrap.yaml | kubectl apply -f -`). It shares a cluster-scoped binding, `deployer-namespace-reader`, with the new one, so the new bootstrap re-pointed it at the new namespace. Put the old token back in `KUBE_DEPLOYER_TOKEN` (`kubectl -n vibecraft get secret deployer-token ...`).
3. Scale the new stack to zero (`cloudflared` above all, so two connectors never share the tunnel), then scale the old stack back up (Postgres and MinIO first) and unsuspend its backup.

After step 9 there is no way back to the old data.

## Local development

Nothing here touches production. Local data is **reset**, not carried over: the dev Firebase project changes, so the same email gets a new Firebase uid, and an old `users` row (unique `username`, looked up by `firebase_uid`) would block that sign-in.

1. **Stop the five services.** Nothing may be connected to Postgres while it is recreated.
2. **Recreate Postgres and MinIO from empty volumes** under their new container names. On start-up `infra/postgres-init/` creates the three `singularity-*-db` databases:

   ```bash
   docker compose -f services.docker-compose.yml down -v --remove-orphans
   docker compose -f services.docker-compose.yml up -d
   ```

   This deletes every local project, chat and stored file (see [Resetting local data](../local-development/resetting-data.md)).

   If you are *not* moving local dev to a new Firebase project, you can keep your data instead: run `down` and `up -d` without `-v`, then rename each database in place with `docker exec pgvector-singularity psql -U user -d postgres -c 'ALTER DATABASE "vibecraft-<service>-db" RENAME TO "singularity-<service>-db"'` for `account`, `workspace` and `intelligence`.

3. **Point local dev at the dev Firebase project.** In the repository-root `.env` set `FIREBASE_PROJECT_ID` and `FIREBASE_CREDENTIALS_PATH` (the dev project's service-account JSON, kept outside the repository). In `frontend/.env.local` set the four `VITE_FIREBASE_*` values from the dev project's web app.

4. **Live previews (only if you run them).** kind cannot rename a cluster, so delete the old one and create it again under the new name. Always pass the context explicitly: a bare `kubectl` acts on whichever cluster is current, which may be production.

   ```bash
   kind delete cluster --name vibecraft
   ```

   Then follow [Running live previews locally](../local-development/live-previews.md) from the top: it creates the cluster `singularity`, builds and loads `singularity-proxy:latest`, and applies the `singularity-ai` namespace. The full-stack rehearsal cluster is likewise now `singularity-rehearsal`.

5. Start the services as usual, then sign in. The first sign-in against the dev Firebase project creates a fresh account row.
