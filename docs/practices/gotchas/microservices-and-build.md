# Pitfalls: Microservices and Build

## A `@FeignClient(path = ...)` prefix breaks internal calls

- **Symptom:** every call through one Feign client is a `401`, surfacing as a `500` on the user request that triggered it. Session authentication itself makes such a call, so this can break most requests.
- **Cause:** `FeignClientInterceptor` attaches the shared-secret header only to paths starting `/internal/`. A client-level `path` prefix hides the path from it.
- **Fix:** put the full `/internal/v1/...` path on each method, never on the `@FeignClient`. Testing the endpoint with `curl` and the secret proves only the callee; test through the real client.

## Shared `common-lib` SNAPSHOT jar

- **Symptom:** a service fails with `NoClassDefFoundError` for a class you just added to `common-lib` (Mockito reports "Could not modify all classes"), even though the reactor compiled.
- **Causes:**
  - `mvn compile` doesn't install `common-lib` into `~/.m2`, so `spring-boot:run` on a dependent service still resolves the previous jar;
  - every checkout on the machine shares the one `~/.m2` `common-lib-0.0.1-SNAPSHOT.jar`, so another checkout's `install` can silently replace yours.
- **Fix:** build and test as a reactor — `./mvnw -pl common-lib,<service> test` or `... compile spring-boot:run` — which resolves `common-lib` from source. If you must `install`, don't do it while another checkout's services are running (Windows locks the jar).

## `spring-cloud-dependencies` overrides the fabric8 version

- **Symptom:** workspace-service fails at runtime with `NoClassDefFoundError: io/fabric8/kubernetes/client/...` after a change to the root `pom.xml`.
- **Cause:** `spring-cloud-dependencies` manages `io.fabric8:kubernetes-client-api` at a different version from the `kubernetes-client` 6.13.4 in use. A mismatched pair compiles, and fails only on first use.
- **Fix:** the root `pom.xml` imports `io.fabric8:kubernetes-client-bom:6.13.4` *before* `spring-cloud-dependencies`. Keep that order, and after changing either version check `./mvnw -pl workspace-service dependency:tree -Dincludes=io.fabric8`.

## MinIO's default OkHttp

- **Symptom:** MinIO SDK classes fail to compile with `cannot access okhttp3.HttpUrl`.
- **Cause:** `io.minio:minio` pulls in an OkHttp 5 artifact with Gradle-only metadata.
- **Fix:** `okhttp:4.12.0` is pinned explicitly in `pom.xml`; don't let it resolve transitively.

## Where a permission guard goes on a shared service method

- **Symptom (either direction):** every AI file read fails, or a non-member can read a private project's files.
- **Cause:** `InternalWorkspaceController` calls `ProjectFileService` as the internal machine principal, which has no user id, so a `@PreAuthorize` on that service method breaks the internal API. But a browser-facing controller that reaches an *unguarded* service method is open to every signed-in user.
- **Fix:** put the guard on the browser-facing controller (`FileController`) for methods the internal API also uses. `FileReadAuthorizationTest` pins both halves.

## `.env` not found under `spring-boot:run`

- **Symptom:** a service started with `./mvnw -pl <service> spring-boot:run` boots with blank secrets.
- **Cause:** a forked `spring-boot:run` runs in the module's directory, but `.env` is at the repository root.
- **Fix:** each service's `pom.xml` sets the plugin's `workingDirectory` to the repository root. A new service needs the same setting.
