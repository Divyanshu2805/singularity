# Pitfalls: Kubernetes

## Writing back an object read with fabric8 6.13.4

- **Symptom:** starting a preview fails with a `503`; the log shows `NullPointerException: "keySerializer" is null`.
- **Cause:** fields a current API server returns that the 6.13.4 model doesn't know (`managedFields`, `status.observedGeneration`, …) land in an `additionalProperties` map that Boot 4.1's Jackson can't serialize. `pods().resource(pod).update()` on a fetched pod fails every time; trimming `managedFields` alone doesn't help.
- **Fix:** send a minimal JSON merge patch instead, carrying the `resourceVersion` as a precondition (`PreviewRunnerPool.claim()`). Any code that writes back an object it just read with this client should patch, not update.

## `pods/exec` needs the `get` verb

- **Symptom:** workspace-service can list, claim and patch runner pods, but every exec fails with `403`, reported as "Couldn't reach the preview cluster".
- **Cause:** fabric8's exec and file upload use a WebSocket — an HTTP `GET` — so a Role granting only `create` on `pods/exec` (the verb for the older SPDY `POST`) denies them. `kubectl exec --as=<service account>` from outside succeeds and misleads.
- **Fix:** grant `[get, create]` on `pods/exec` (`deploy/k8s/base/rbac.yaml`). To diagnose RBAC, read the raw `403` body from inside a pod running as that service account.

## A non-root user needs a writable `$HOME` in each image

- **Symptom:** every preview start fails; the syncer container logs `mkdir /.mc: permission denied`.
- **Cause:** `quay.io/minio/mc` has no home directory for uid 1000, so with `runAsUser: 1000` `$HOME` defaults to `/`. (`node:20-alpine` does have `/home/node`, so the runner container was fine.)
- **Fix:** set `HOME=/tmp` on containers whose image has no home for the configured user. Test the actual code path in every container, not just one.

## Kubernetes service links collide with port properties

- **Symptom:** every Java service crash-loops with `Invalid value 'tcp://…' for configuration property 'server.port'`.
- **Cause:** Kubernetes injects a `<SERVICE_NAME>_PORT` variable for every Service in the namespace. Each service's `application.yaml` reads an override with exactly that name (`${DISCOVERY_SERVICE_PORT:8761}`, …), and the injected URI wins.
- **Fix:** `enableServiceLinks: false` on every Deployment. The services use DNS and Eureka, never these variables.

## The `admin` ClusterRole excludes namespaces and quotas

- **Symptom:** the CI deploy identity gets `403` applying namespaces, `LimitRange` or `ResourceQuota` objects.
- **Cause:** by design, a namespace admin can't raise the limits a cluster admin imposed. Local kind clusters use full-rights credentials, so this only shows up on a real cluster.
- **Fix:** those objects are a one-time bootstrap (`deploy/k8s/namespaces/`), applied with a privileged kubeconfig, not part of the CI apply.

## Kustomize can't reference a loose file outside its root

- **Symptom:** ``file '…' is not in or below 'overlays/kind'``.
- **Cause:** Kustomize lets an overlay reference a *directory* containing its own `kustomization.yaml` from outside its root, but not an individual file.
- **Fix:** give the shared file its own minimal `kustomization.yaml` directory (`deploy/k8s/namespaces/`) and reference that.

## A ConfigMap changed in place doesn't restart its pods

- **Symptom:** a config change deploys "successfully" but the running pod keeps the old behaviour.
- **Cause:** when a Deployment's image doesn't change, updating a ConfigMap of the same name doesn't change the pod template, so nothing restarts.
- **Fix:** generate the ConfigMap with Kustomize's `configMapGenerator`, whose content-hashed name changes the pod template whenever the content does (as cloudflared's config does).

## MinIO without `CAP_IPC_LOCK`

- **Symptom:** `mc admin user add` hangs forever, with no error and no log line on either side. Other `mc` commands work.
- **Cause:** creating a user calls `mlockall()`, which needs `CAP_IPC_LOCK` on **both** the MinIO server and the `mc` client. With every capability dropped, the call silently fails to do what the code assumes. Once granted, `mlockall()` pins the whole reserved address space, so a tight memory limit gets the container OOM-killed.
- **Fix:** add `IPC_LOCK` back on both containers, and give the bootstrap job enough memory (512 Mi; 64 Mi was not enough). See `k8s/minio.yml`.

## Changing a Secret doesn't change an initialized server

- **Symptom:** after a password change in GitHub, the next pod that restarts crash-loops on a login error. Pods already running are fine.
- **Cause:** Postgres and MinIO read their initial password once, when their volume is created, and keep it there.
- **Fix:** rotate on the server first (`ALTER USER …`; restart MinIO with the new value), then change the Secret. See [deploys](../../operations/deploys.md#secrets).

## A failing CronJob notifies nobody

- **Symptom:** backups silently stop while every service stays healthy.
- **Cause:** Kubernetes doesn't alert on a failed Job.
- **Fix:** the backup job writes a `LATEST` marker as its very last step, only on full success, and a daily workflow checks its age. Don't move or remove that write. See [monitoring](../../operations/monitoring.md).
