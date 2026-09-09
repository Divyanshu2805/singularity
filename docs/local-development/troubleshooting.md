# Troubleshooting

Common problems and their fixes. Deeper explanations of the silent-failure traps are in [known pitfalls](../practices/gotchas/README.md).

## Start-up

| Symptom | Cause | Fix |
|---|---|---|
| Time-zone error on the first Postgres connection (Windows) | The JVM reports the legacy `Asia/Calcutta` zone | Every service's `main()` already applies the workaround. For a Spring-context test, see [the pitfall](../practices/gotchas/spring-and-jpa.md#the-windows-time-zone-workaround-is-per-service) |
| Flyway "checksum mismatch", or Hibernate "missing column" / "missing table" | The entities and migrations disagree, or an applied migration was edited | Add a new migration; never edit an applied one. For a local database built from an old migration, [reset it](resetting-data.md) |
| `No qualifying bean` for a class with a `@Value` field | Lombok moved the field into the constructor without its annotation | See [the pitfall](../practices/gotchas/spring-and-jpa.md#value-on-a-final-field-generated-by-lombok) |
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
| `403` on a write from the browser | Missing or stale CSRF token | Read the `XSRF-TOKEN` cookie fresh before each write and send it as `X-XSRF-TOKEN` |
| Chat history is empty after a turn that clearly generated files | Saving the turn's events failed | Look for a `WARN` about `chat_events` in intelligence-service's log; events fall back to one-at-a-time saves, so most are usually kept |
| A `.ts` file is shown with the wrong type | The JDK maps `.ts` to MPEG transport stream | `util.ContentTypeUtils` overrides it before the JDK guess; check that ordering if it regresses |

## Previews

The preview panel tells you which failure it is:

| Message | Meaning | What to check |
|---|---|---|
| "Every preview runner is busy" | Every warm pod is claimed (`503`, `CAPACITY_UNAVAILABLE`) | `kubectl -n vibecraft-ai get pods -L status,project-id`. A claimed pod is replaced within about a minute |
| "The preview couldn't start" | A dependency failed — the cluster, Redis or storage (`503`, `UPSTREAM_UNAVAILABLE`) | workspace-service's log has the stack trace. Check the port forwards from [live previews](live-previews.md) are running |
| "The preview service isn't reachable" | No service answered | Check the Gateway (`:8000`) and workspace-service are running |
| Every preview link returns `401` | The proxy's secret differs from `PREVIEW_ACCESS_TOKEN_SECRET` | Recreate the `preview-access-token` secret with the exact value from `.env` |
