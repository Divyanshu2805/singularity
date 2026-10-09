# Publishing locally

Publishing builds an app in a runner pod and serves it from the preview proxy, so it needs the same local cluster previews do ([live previews](live-previews.md)) plus three small additions: a bucket, a read-only MinIO user for the proxy, and the proxy's new settings. Every other feature works without any of it; without a cluster, pressing Publish ends in a plain "something went wrong on our side" sentence and nothing else is affected.

A published link looks like `http://<name>.localhost:8090/`: browsers resolve any `*.localhost` name to the loopback address, and workspace-service already keeps port 8090 forwarded to the proxy while it runs (`PreviewPortForwarder`).

## One-time setup

1. **The bucket.** workspace-service creates `published-apps` at startup (`StorageBucketInitializer`); nothing to do.
2. **A read-only user for the proxy.** `publishedreader` may read only `<name>/current.json` and `<name>/*/site/*` in that bucket - never the `src/` snapshot stored beside each build. On the cluster's own MinIO (`k8s/minio.yml`) the `minio-bootstrap-published-reader` Job does it. With MinIO running in Docker (the usual local setup) create it with the same policy; load `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` into your shell from `.env` without printing them, choose a password for the new user in `PUBLISHED_PW`, and run:

   ```bash
   docker run --rm --network host --entrypoint sh -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e PUBLISHED_PW \
     ghcr.io/divyanshu2805/mc:RELEASE.2025-08-13T08-35-41Z -c '
       export HOME=/tmp
       mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
       mc mb --ignore-existing local/published-apps
       printf "%s" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::published-apps/*/current.json\",\"arn:aws:s3:::published-apps/*/site/*\"]}]}" > /tmp/policy.json
       mc admin policy create local published-readonly /tmp/policy.json
       mc admin user add local publishedreader "$PUBLISHED_PW"
       mc admin policy attach local published-readonly --user publishedreader'
   ```

3. **The proxy's settings.** `k8s/singularity-proxy.yml` now carries `PUBLISHED_DOMAIN=localhost`, the bucket, the MinIO endpoint (`http://minio-service:9000`, the bridge the cluster already has) and the `publishedreader` secret. Create the secret with the password from step 2, rebuild the proxy image as you do after any `proxy/` change, and apply the manifest:

   ```bash
   kubectl --context kind-singularity -n singularity-ai create secret generic minio-published-credentials --from-literal=password="$PUBLISHED_PW"
   docker build -t singularity-proxy:latest proxy && kind load docker-image singularity-proxy:latest --name singularity
   kubectl --context kind-singularity apply -f k8s/singularity-proxy.yml
   kubectl --context kind-singularity -n singularity-ai rollout restart deployment/singularity-proxy
   ```

   The proxy logs `Published apps are off: ...` at start when any of the settings is missing, and treats every hostname as a preview's, as it did before.

## Settings

All under `publishing.*` in workspace-service's `application.yaml`; each has a default that suits local use.

| Setting | Meaning |
|---|---|
| `public-scheme`, `public-domain`, `public-port` | What a link is built from. Follow the preview's unless `PUBLISHING_PUBLIC_*` says otherwise. The proxy's `PUBLISHED_DOMAIN` must be the same domain. |
| `bucket` | `published-apps`. |
| `plan-limits`, `default-limit` | Live apps one owner may have, by plan name (Free 1, Pro 3, Business 10). |
| `max-builds-per-hour`, `min-build-interval` | Ten an hour per person; 30 seconds between builds of one project. |
| `runner-wait`, `install-timeout`, `build-timeout`, `collect-timeout` | How long a build waits for a runner (90 s) and each step may take. |
| `max-source-files`, `max-source-bytes`, `max-output-files`, `max-output-bytes` | The limits on what goes into a build and what comes out. |
| `retire-after` | How long a replaced build is kept before it is deleted (2 m). |
| `heartbeat-stale-after` | When a build that has stopped reporting is called abandoned (45 s). |

## Running the real thing

The publish pipeline test builds a real app on a real cluster and fetches it through the real proxy; see [testing](../practices/testing.md#the-publish-pipeline-test). To try it by hand, start the backend as for previews, sign in as a project's owner, press **Publish** in the header and follow [the checklist](publish-checklist.md).
