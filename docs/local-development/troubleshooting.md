# Troubleshooting

Common problems and their fixes. Deeper explanations of the silent-failure traps are in [known pitfalls](../practices/gotchas/README.md).

## Start-up

| Symptom | Cause | Fix |
|---|---|---|
| Time-zone error on the first Postgres connection (Windows) | The JVM reports the legacy `Asia/Calcutta` zone | Every service's `main()` already applies the workaround. For a Spring-context test, see [the pitfall](../practices/gotchas/spring-and-jpa.md#the-windows-time-zone-workaround-is-per-service) |
| Flyway "checksum mismatch", or Hibernate "missing column" / "missing table" | The entities and migrations disagree, or an applied migration was edited | Add a new migration; never edit an applied one. For a local database built from an old migration, [reset it](resetting-data.md) |
| `No qualifying bean` for a class with a `@Value` field | Lombok moved the field into the constructor without its annotation | See [the pitfall](../practices/gotchas/spring-and-jpa.md#value-on-a-final-field-generated-by-lombok) |
| The idea interview shows a notice that the AI could not be reached and asks general questions; a build ends with "a setup problem on our side" | The AI provider refused the server's key, or the account is out of credit. intelligence-service logs it as an error naming the cause | Check the key with `curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/key`. A `401 User not found` means the key was deleted or revoked: create a new one, put it in `.env`, and restart intelligence-service |
| The idea interview works, but every build ends in "Something went wrong while generating"; the log shows `400 Bad Request` from `generativelanguage.googleapis.com` | A Gemini 3 model rejected the request that follows a tool call for lacking its thought signature | `GeminiToolCallCompat` handles this while `spring.ai.openai.base-url` points at Google - check that it is set and that intelligence-service was restarted after the change. See [using Gemini](configuration.md#using-gemini-instead-of-openrouter) |
| A bean's effect silently doesn't happen | The class is outside the component-scan root, or is an unregistered `common-lib` class | See [the pitfall](../practices/gotchas/spring-and-jpa.md#a-bean-outside-the-component-scan-root-never-exists) |
| `NoClassDefFoundError` for a class you just added to `common-lib` | A stale `common-lib` jar in `~/.m2` | Build as a reactor: `./mvnw -pl common-lib,<service> ...`. See [the pitfall](../practices/gotchas/microservices-and-build.md#shared-common-lib-snapshot-jar) |
| workspace-service fails with `NoClassDefFoundError: io/fabric8/...` | Mismatched fabric8 versions after a `pom.xml` change | See [the pitfall](../practices/gotchas/microservices-and-build.md#spring-cloud-dependencies-overrides-the-fabric8-version) |
| A service boots with blank secrets | `.env` wasn't found | Keep `.env` at the repository root; each service's `pom.xml` runs from there |
| "Port 9404 was already in use" | Two services share the default management port | Give each service its own `MANAGEMENT_SERVER_PORT` ([setup](setup.md#2-start-the-backend)) |
| Any other "port already in use" | Another stack is running | Stop it, or give the second stack its own ports ([running two stacks](setup.md#running-two-stacks-at-once)) |

## Requests

| Symptom | Cause | Fix |
|---|---|---|
| A permission check denies a legitimate user | A `@PreAuthorize` parameter name doesn't match the method's | See [the pitfall](../practices/gotchas/spring-and-jpa.md#preauthorize-parameter-names-must-match-exactly) |
| Every call to one internal API fails with `401` | A `@FeignClient(path = ...)` prefix | See [the pitfall](../practices/gotchas/microservices-and-build.md#a-feignclientpath---prefix-breaks-internal-calls) |
| `403` on a write from the browser | Missing or stale CSRF token | Read the `__Host-XSRF-TOKEN` cookie fresh before each write and send it as `X-XSRF-TOKEN` |
| Chat history is empty after a turn that clearly generated files | Saving the turn's events failed | Look for a `WARN` about `chat_events` in intelligence-service's log; events fall back to one-at-a-time saves, so most are usually kept |
| A chat request answers `409` "already generating" | A turn really is running for that project — this person's in another tab, or a collaborator's | Wait for it or stop it. A turn cannot outlive `generation.turn-timeout` (20 minutes), and an entry older than 45 minutes is dropped when the next request arrives, so this can no longer need a restart |
| A build ends with "The model didn't return an answer" or keeps saying "The reply wasn't in a form that can be saved" | The model answered outside the protocol's tags, twice | intelligence-service logs `Skipped N character(s) of text outside the protocol's blocks` with the start of what it wrote. A model that does this often is a poor fit for the build prompt |
| The first page load after restarting a service is a `500` | Two Feign calls raced to build the client's decoder | Fixed by `FeignConverterWarmup`; see [the pitfall](../practices/gotchas/microservices-and-build.md#the-first-feign-calls-after-a-restart-race-each-other) if it returns |
| A `.ts` file is shown with the wrong type | The JDK maps `.ts` to MPEG transport stream | `util.ContentTypeUtils` overrides it before the JDK guess; check that ordering if it regresses |

## Previews

The preview panel tells you which failure it is:

| Message | Meaning | What to check |
|---|---|---|
| "Every runner is busy right now", with a place in the line | Every warm pod is claimed; the start is waiting for one | Nothing: it starts by itself. `kubectl -n singularity-ai get pods -L status,project-id` shows the pool. A claimed pod is replaced within about a minute. If nothing comes free in 5 minutes (`preview.queue-timeout`) the start fails saying so |
| "The project's packages couldn't be installed" / "The app's dev server couldn't start" | The project's own `package.json` or config is wrong; the sentence under the title says which package or file | The output shown under it is npm's or Vite's own. These are not retried, because repeating them repeats the result |
| "The preview isn't showing your app" | The frame loaded but the page inside never reported in within 12 seconds | Reload. If it persists, the proxy in your cluster predates this checkout — rebuild and load it (`docker build -t singularity-proxy:latest proxy && kind load docker-image singularity-proxy:latest --name singularity && kubectl -n singularity-ai rollout restart deployment/singularity-proxy`) |
| The address bar's back and forward stay grey, or the Console tab stays empty | Same cause: an older proxy injects an older reporter | Rebuild and load the proxy as above |
| A preview stays on "Updating" | The copy into the runner is failing; workspace-service logs `Couldn't copy revision …` with the syncer's output | Usually storage: check MinIO is reachable from the pod. It is retried on every sweep |
| "The preview couldn't start" | A dependency failed — the cluster, Redis or storage (`503`, `UPSTREAM_UNAVAILABLE`) | The panel has already retried three times by the time it shows this. workspace-service's log has the stack trace. At startup it should log `Forwarding localhost:6379 -> redis` and `Forwarding localhost:8090 -> preview proxy`; a `Couldn't forward …` warning instead means it can't reach the cluster — check the `kind-singularity` context exists (`kubectl config get-contexts`) and the cluster's container is running |
| A preview stays on "Copying project files" and then fails; the syncer's log shows an i/o timeout reaching `minio-service:9000` | The runner pool's network policy lets pods reach MinIO only as an in-cluster pod, but the local setup points `minio-service` at MinIO on your machine | `k8s/runner-pods.yml` has a rule for Docker Desktop's host address. If yours differs, find it with `kubectl -n singularity-ai exec <runner pod> -c runner -- getent hosts minio-service` and update the `ipBlock` rule |
| "The preview service isn't reachable" | No service answered | Check the Gateway (`:8000`) and workspace-service are running |
| Every preview link returns `401` | The proxy's secret differs from `PREVIEW_ACCESS_TOKEN_SECRET` | Recreate the `preview-access-token` secret with the exact value from `.env` |
