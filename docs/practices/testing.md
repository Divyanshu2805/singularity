# Testing

## Test suites

| Suite | Command | Size | Needs |
|---|---|---|---|
| Backend (all modules) | `./mvnw test` | 956 tests — common-lib 29, gateway 69, account 32, workspace 303, intelligence 523 | Docker, for one integration test (below) |
| Frontend | `cd frontend && npm test` | 739 tests in 50 files (Vitest) | — |
| Preview proxy | `cd proxy && node --test` | 30 tests: the access token, routing, and the script injected into a previewed page, run against a stand-in window | — |
| A real preview on kind | see [below](#the-preview-pipeline-test) | 9 steps on one project (`PreviewPipelineIT`); not part of `./mvnw test` | A kind cluster and Docker |

Run the tests you changed by name while iterating:

```bash
./mvnw -pl common-lib,workspace-service test -Dtest=ClassName          # one class
./mvnw -pl common-lib,workspace-service test -Dtest=ClassName#method   # one method
```

Include `common-lib` in the `-pl` list so it is built from source rather than resolved from the shared `~/.m2` jar (see [pitfalls](gotchas/microservices-and-build.md#shared-common-lib-snapshot-jar)).

## The build benchmark

Twenty fixed requests - first builds, changes to the apps those builds left, questions, requests for another stack - run as whole build turns against the configured model, in memory, with no sign-in and nothing saved (`BuildBenchmarkIT`, scenarios in `intelligence-service/src/test/resources/bench/scenarios.json`). It spends real tokens, so it is not part of the suite: its name keeps the build from picking it up, and it runs only when asked for.

```bash
./mvnw -pl common-lib,intelligence-service test -Dtest=BuildBenchmarkIT -Dsurefire.failIfNoSpecifiedTests=false \
  "-DargLine=-Dbench.out=C:/path/to/out -Dbench.label=gemini-3.8-flash"
scripts/bench-verify.sh C:/path/to/out      # do the built projects install, type-check and bundle?
```

Settings go inside `argLine` (a plain `-D` does not reach the forked test JVM): `-Dbench.only=todo-build,todo-dark-theme`, `-Dspring.ai.openai.chat.options.model=...`, `-Dai.calls.build.reasoning-effort=low`, and `-Dbench.price.input` / `.cached` / `.output` in dollars per million tokens for a cost column. It writes `report.md` (per kind: how many turns were right, time to the first word and the first file, total time, calls and tokens per turn), `results.json`, every reply's raw text with the provider's own usage lines, and each project as its turn left it.

A turn counts as right when it ended the way its kind should and the server had nothing to add - no edit that could not be applied, no file that does not parse, no import that does not resolve. `scripts/bench-verify.sh` then compiles the written projects in a throwaway container, since generated code is never built on the machine itself. Do not compile the module while a run is in flight; copy the repository and run it from the copy.

Run it before and after any change to the prompt, the project brief, the turn engine or the model, and add a row to [the results](build-benchmark-results.md). `BuildBenchmarkTest` runs the same path on the scripted model, so the benchmark itself is covered by the suite.


## The preview pipeline test

A real preview, start to finish, on a real kind cluster: the starter template in a real MinIO, a warm runner pod claimed, a real `npm install` and Vite dev server, a real route in Redis, and the page fetched through the real proxy (`PreviewPipelineIT` in workspace-service). In one run on one project it covers a first start, a link that has run out or was forged, an edit arriving without a restart, code that does not compile, a new package installed by the server itself, a runner pod killed, a start waiting in line for a runner, Stop, and a package that does not exist.

Like the benchmark it is not part of the suite - its name keeps the build from picking it up - because it needs a cluster. CI runs it on every push and pull request (job `preview-pipeline`); locally:

```bash
k8s/preview-test-cluster.sh --context kind-singularity      # once, and again after changing proxy/ or k8s/
./mvnw -pl common-lib,workspace-service test -Dtest=PreviewPipelineIT -Dsurefire.failIfNoSpecifiedTests=false
```

The script builds the proxy from the checkout and stands the whole pipeline up in a namespace of its own, `singularity-it`, beside the one your own previews use. That separation is required, not tidy: a workspace-service running against the same namespace releases every claimed pod its own database has not heard of, two minutes after it was claimed ([pitfalls](gotchas/kubernetes.md#two-databases-must-never-share-a-runner-namespace)). Add `--seed` to give the pool the pre-installed `node_modules` production has, and `--down` to remove the namespace. It needs Docker for the test's own Postgres and takes about six minutes without the seed.

It writes how long each start took to `workspace-service/target/preview-timings.txt`. Run it after any change to `PreviewBootstrapper`, `PreviewSynchronizer`, `PreviewRunnerPool`, `PreviewRouter`, `proxy/`, or the runner pod manifests, and put new numbers in [capacity](../deployment/capacity.md#measured-start-times) when they move.

## Backend

- **Plain JUnit by default.** Business logic is tested without a Spring context wherever possible: tests construct the class under test directly and mock its collaborators (repositories, `MinioClient`, Feign clients). They need no database or cluster, and they sidestep the Windows time-zone problem a Spring-context test would hit.
- **Slice tests where the wiring is the point.** Each domain service has one `@WebMvcTest` that drives requests through the real security filter chain (`FullChainAccountAccessTest`, `FullChainFileAccessTest`, `FullChainChatAccessTest`). The Gateway's `RoutingTableTest` is a `@SpringBootTest` that needs no database.
- **One real-infrastructure test.** `RevisionPublisherIntegrationTest` (workspace-service) uses Testcontainers with real PostgreSQL and MinIO, because it asserts things a mock can't prove: that a failed publish really rolled back, and that concurrent publishes really serialize to one winner. It uses a `@DataJpaTest` slice with `@AutoConfigureTestDatabase(replace = NONE)` and calls `WindowsTimezoneWorkaround.apply()` in `@BeforeAll`. Don't reach for Testcontainers otherwise.
- **No test calls the AI model.** Nothing in the suite costs tokens. The build pipeline is tested with a stub model that returns one prepared stream per call (`BuildTurnTest`), and whole turns are run on the real starter template against the scripted model the `stub-ai` profile uses (`StubBuildTurnTest`, through `TurnHarness` and `ScratchProject`).
- **The prompt is held to the template.** `KitPromptMatchesTemplateTest` reads the starter template off disk and fails if the build prompt names a component the template does not ship, or the other way round.
- **One file of cases for two parsers.** The build chat's tagged text is parsed on the server and again in the browser. `intelligence-service/src/test/resources/protocol/cases.json` holds the answers both must agree on, and is run by `GenerationProtocolCasesTest` and by the frontend's `generation-protocol.test.ts`. A new rule for that text goes into the file first.

## Frontend

Vitest with Testing Library. Most tests target framework-free logic in `src/lib/` directly rather than rendered components; prefer that shape for new logic. Also run `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` before calling a frontend change done.

## What automated tests don't cover

These are verified by hand. If you change one, verify it against the real thing — a green test run says nothing about them:

| Area | How to verify |
|---|---|
| What the Preview tab does in a browser - the frame being covered and uncovered, the address bar, back and forward, the console, "Up to date" and "Updating", the place in the line - and the cases that need two people or a long wait. The server and proxy side is covered by `PreviewPipelineIT` | Start the backend against a local kind cluster, open a real preview and go down the [preview checklist](../local-development/preview-checklist.md) |
| Stripe billing end to end | Stripe test mode with card `4242 4242 4242 4242`, including the webhook |
| What a real model does with the build prompt — whether it follows the output format, how it reads files, what it does after a tool call | Run one real turn against the configured model and read the raw text it wrote, after any change to `PromptUtils`, `ProjectBrief`, `BuildTurn`, `TurnReview`, `FileEdits` or the read tool - and one real lesson after a change to `CodeInsightPrompts.lessonSystemPrompt` or `lessonBlock`. Four such turns found what several hundred green tests had not ([pitfalls](gotchas/ai-generation.md)) |
| The code check in a preview pod - what a real compiler in a real pod says, how long it takes, that the preview's own files are untouched | With a preview running, send a turn that writes a type error and one that adds a package that does not exist, and read workspace-service's log for the `Type-checked ... problem(s)` line; `CodeCheckServiceImplTest` drives a scripted pod only |
| The **Fix this** button and the suggested next steps in the chat | In a running app: break a file so the preview throws, press the button, and check the fix turn is an edit; finish a build and press a suggestion |
| Service start-up and bean wiring | `./mvnw -pl <module> spring-boot:run` — a wiring cycle or missing bean shows up only when a real context starts |
| Backup and restore (`deploy/k8s/base/backup.yaml`, `deploy/scripts/restore-*`) | Rerun the restore drill on a dedicated kind cluster: seed, fingerprint, back up, damage, restore, compare ([backups](../operations/backups.md)) |

## Adding tests

- New business logic gets a plain JUnit test next to its package.
- A new endpoint gets its path added to `RoutingTableTest` if the prefix is new.
- A new authorization rule gets a test that proves both that the right caller is allowed and that everyone else is denied.
