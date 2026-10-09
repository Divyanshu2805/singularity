# Testing

## Test suites

| Suite | Command | Size | Needs |
|---|---|---|---|
| Backend (all modules) | `./mvnw test` | 1,308 tests — common-lib 31, gateway 78, account 55, workspace 584, intelligence 560 | Docker, for one integration test (below) |
| Frontend | `cd frontend && npm test` | 845 tests in 62 files (Vitest) | — |
| Preview proxy | `cd proxy && node --test` | 69 tests: the access token, routing, the script injected into a previewed page (run against a stand-in window), and publishing - the host and path rules, the headers, the storage signature (checked against AWS's own worked example) and the whole handler against a stand-in store | — |
| A real preview on kind | see [below](#the-preview-pipeline-test) | 9 steps on one project (`PreviewPipelineIT`); not part of `./mvnw test` | A kind cluster and Docker |
| A real publish on kind | see [below](#the-publish-pipeline-test) | 6 steps on one project (`PublishPipelineIT`); not part of `./mvnw test` | A kind cluster and Docker |
| The browser journey | see [below](#the-browser-journey) | One person's whole path in a real browser against every real service, 12 steps (`e2e/tests/journey.spec.ts`) | A kind cluster, Docker and Node |

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


## The browser journey

One person's whole path through the product, in a real browser, against the real services: a visitor who is not signed in is sent to sign in; signing in; an idea and the interview; the first build and its files; the preview coming up and the built app working (a note typed into it is kept); a change asked for in Teach me mode reaching the running preview without a reload; a step's lesson; a marked word opening in the glossary, which keeps it; the project's tour being written once, opening a file and being read back; the lesson's task being set and checked; a reload bringing the conversation back; the usage meter; a second person being refused the project, its files and its chat; stopping the preview; and signing out ending the session on the server.

```bash
./mvnw -DskipTests package                                  # once, and again after changing a service
(cd e2e && npm ci && npx playwright install chromium)        # once
e2e/stack.sh up --context kind-singularity                  # the whole application on ports of its own
(cd e2e && npm test)
e2e/stack.sh down --context kind-singularity                # add --namespace-too to remove the namespace and database
```

`e2e/stack.sh` starts a throwaway Postgres, the Firebase Auth emulator, the five services from their jars, the production build of the frontend, and a preview pipeline in a namespace of its own (`singularity-e2e`) - beside whatever you have running, on different ports, touching none of it. It takes about three minutes the first time and about ninety seconds after, and the test itself about thirty-five.

Three things are stand-ins, and everything else is real:

| Stand-in | For | Why it is still a fair test |
|---|---|---|
| The `stub-ai` scripted model | The AI provider | Every call runs its real path - parsing, checks, saving, metering - against a reply that costs nothing and is the same every time |
| The Firebase Auth emulator | Firebase | Reached through the same SDK calls in the browser and on the server; the session cookie it leads to is minted and checked by the real code. The frontend is pointed at it by `VITE_FIREBASE_AUTH_EMULATOR_URL`, which is honoured only for an address on this machine |
| Dummy Stripe keys | Stripe | The journey never pays; billing has [its own tests](#backend) |

CI runs it on every push and pull request (job `journey`). It does not gate the deploy yet; add it to `approve`'s needs once it has a few green runs on GitHub.

One [known gap](../known-gaps/constraints-and-trade-offs.md#a-build-saved-while-its-preview-is-starting) is allowed for: when the built app has not appeared in the preview after a minute, the test presses the panel's Reload, records `previewNeededReload` in its timings, and fails only if the app is still missing.

Run it after any change that crosses a service boundary or touches sign-in, the chat stream, the preview panel or the lesson panel. A step that fails leaves a trace, a video and every service's log in `e2e/test-results` and `e2e/.run/logs`.

The same stack serves two measurements that are not tests and run only when asked for: `npm run load` (the [load test](product-numbers.md#under-load)) and, with the stack started with `--real-ai <env file>`, `npm run numbers` (one pass with the configured model, which spends tokens). What they measured is in [the product's numbers](product-numbers.md).

## Coverage

```bash
./mvnw verify && scripts/coverage-summary.sh     # backend: a table per module; reports in <module>/target/site/jacoco
cd frontend && npm run coverage                  # frontend: a summary, and an HTML report in frontend/coverage
```

Each backend module has a floor for the share of its lines the tests run (`coverage.minimum.lines` in its `pom.xml`), and `verify` fails a module that falls under it. It is checked at `verify`, not `test`, so running one test by name is never failed for what it did not cover. The frontend has two floors in `vitest.config.ts`: one for `src/lib`, where the logic and the tests are, and a low one for the whole app that only catches a collapse.

The floors sit a little under what was measured when they were set ([the numbers](product-numbers.md#how-much-of-the-code-the-tests-run)). Raise one when you add tests; do not lower one to get a change through.

## Lighthouse

```bash
cd frontend && npm run build
# serve frontend/dist from the nginx image, as the `lighthouse` job in ci.yml does, then:
(cd e2e && node lighthouse.mjs http://127.0.0.1:14180/ http://127.0.0.1:14180/login)
```

Audits the pages anyone can open without signing in, as a phone and as a desktop. Accessibility, best practices and SEO are held to floors and fail the job; performance is reported and not enforced, since it measures the machine as much as the page. CI runs it on every push and pull request (job `lighthouse`).

## The preview pipeline test

A real preview, start to finish, on a real kind cluster: the starter template in a real MinIO, a warm runner pod claimed, a real `npm install` and Vite dev server, a real route in Redis, and the page fetched through the real proxy (`PreviewPipelineIT` in workspace-service). In one run on one project it covers a first start, a link that has run out or was forged, an edit arriving without a restart, code that does not compile, a new package installed by the server itself, a runner pod killed, a start waiting in line for a runner, Stop, and a package that does not exist.

Like the benchmark it is not part of the suite - its name keeps the build from picking it up - because it needs a cluster. CI runs it on every push and pull request (job `preview-pipeline`); locally:

```bash
k8s/preview-test-cluster.sh --context kind-singularity      # once, and again after changing proxy/ or k8s/
./mvnw -pl common-lib,workspace-service test -Dtest=PreviewPipelineIT -Dsurefire.failIfNoSpecifiedTests=false
```

The script builds the proxy from the checkout and stands the whole pipeline up in a namespace of its own, `singularity-it`, beside the one your own previews use. That separation is required, not tidy: a workspace-service running against the same namespace releases every claimed pod its own database has not heard of, two minutes after it was claimed ([pitfalls](gotchas/kubernetes.md#two-databases-must-never-share-a-runner-namespace)). Add `--seed` to give the pool the pre-installed `node_modules` production has, and `--down` to remove the namespace. It needs Docker for the test's own Postgres and takes about six minutes without the seed.

It writes how long each start took to `workspace-service/target/preview-timings.txt`. Run it after any change to `PreviewBootstrapper`, `PreviewSynchronizer`, `PreviewRunnerPool`, `PreviewRouter`, `proxy/`, or the runner pod manifests, and put new numbers in [capacity](../deployment/capacity.md#measured-start-times) when they move.

## The publish pipeline test

A real publish, start to finish, on the same kind cluster: the starter template's files in a real MinIO, a real warm runner pod claimed for the build, a real `npm install` and `vite build`, the build taken out of the pod as a tar and stored, the pointer written, and the app fetched through the real proxy at its own hostname (`PublishPipelineIT` in workspace-service). In one run on one project it covers a first publish going live and being served (the page with its mark and the strict headers, a hashed script cached for good, a refresh on a route of the app, a missing image being a 404, and a path that climbs out of the build getting no source file); every build pod being given back; a change being offered as an update and replacing what is served; a build that cannot compile failing in plain words with its output while the live app keeps serving; unpublishing taking the app down and the sweeper deleting everything it left; and publishing again coming back at the same link.

Like the preview test it is not part of the suite - its name keeps the build from picking it up - because it needs the cluster. `k8s/preview-test-cluster.sh` stands it up (it now also creates the proxy's `publishedreader` user), CI runs both tests in the `preview-pipeline` job, and locally:

```bash
k8s/preview-test-cluster.sh --context kind-singularity --seed
./mvnw -pl common-lib,workspace-service test -Dtest=PublishPipelineIT -Dsurefire.failIfNoSpecifiedTests=false
```

With `--seed` the whole run takes about 75 seconds; without it every build is a full `npm install`. It writes how long each publish took to `workspace-service/target/publish-timings.txt`. Run it after any change to `PublishBuilder`, `PublishedStore`, `PublishSweeper`, `PublishSourceReader`, `util/TarArchive`, `proxy/published*.js` or `proxy/s3.js`, and put new numbers in [capacity](../deployment/capacity.md#publishing) when they move.

Written first against a mock pod, the pipeline failed on the real cluster twice, each time on something no mock could show: a tar sent through a command's standard input never finished, because the exec's websocket cannot say "end of input" ([pitfalls](gotchas/kubernetes.md#a-websocket-exec-cannot-end-standard-input)); and unpublishing straight after an update left the live build in storage, because the row remembers one retired build and the update had already used the slot.

## Backend

- **Plain JUnit by default.** Business logic is tested without a Spring context wherever possible: tests construct the class under test directly and mock its collaborators (repositories, `MinioClient`, Feign clients). They need no database or cluster, and they sidestep the Windows time-zone problem a Spring-context test would hit.
- **Slice tests where the wiring is the point.** Each domain service has one `@WebMvcTest` that drives requests through the real security filter chain (`FullChainAccountAccessTest`, `FullChainFileAccessTest`, `FullChainChatAccessTest`). The Gateway's `RoutingTableTest` is a `@SpringBootTest` that needs no database.
- **Billing is followed from a signed webhook to stored state.** `BillingWebhookFlowTest` joins the real controller, payment processor and subscription service, with only the repositories and Stripe's one read call stood in, and delivers payloads signed the way Stripe signs them: a paid checkout, the same delivery twice, a delivery that failed and was sent again, a plan change, an older event arriving late, a failed payment through its grace period, a cancellation, and a body changed after signing.
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
| What the Publish panel and the share page do in a browser - the steps advancing, the link and its copy and open buttons, Update, the failed-build message, sharing, fork, and the "Published" mark on the cards. The server and proxy side is covered by `PublishPipelineIT` | Go down the [publishing checklist](../local-development/publish-checklist.md) |
| Stripe billing against Stripe itself - the hosted checkout page, the portal, a real webhook delivery. What the app does with a signed event once it arrives is covered by `BillingWebhookFlowTest` | Stripe test mode with card `4242 4242 4242 4242`, including the webhook |
| What a real model does with the build prompt — whether it follows the output format, how it reads files, what it does after a tool call | Run one real turn against the configured model and read the raw text it wrote, after any change to `PromptUtils`, `ProjectBrief`, `BuildTurn`, `TurnReview`, `FileEdits` or the read tool - and one real lesson after a change to `CodeInsightPrompts.lessonSystemPrompt` or `lessonBlock` - and one real tour, glossary entry, task and task check (with the file edited and saved between two checks) after a change to the prompts of the same names, which `e2e/stack.sh up --real-ai` and a scratch browser script can drive without a sign-in of your own. Four such turns found what several hundred green tests had not ([pitfalls](gotchas/ai-generation.md)) |
| The code check in a preview pod - what a real compiler in a real pod says, how long it takes, that the preview's own files are untouched | With a preview running, send a turn that writes a type error and one that adds a package that does not exist, and read workspace-service's log for the `Type-checked ... problem(s)` line; `CodeCheckServiceImplTest` drives a scripted pod only |
| The **Fix this** button and the suggested next steps in the chat | In a running app: break a file so the preview throws, press the button, and check the fix turn is an edit; finish a build and press a suggestion |
| Service start-up and bean wiring | `./mvnw -pl <module> spring-boot:run` — a wiring cycle or missing bean shows up only when a real context starts |
| Backup and restore (`deploy/k8s/base/backup.yaml`, `deploy/scripts/restore-*`) | Rerun the restore drill on a dedicated kind cluster: seed, fingerprint, back up, damage, restore, compare ([backups](../operations/backups.md)) |

## Adding tests

- New business logic gets a plain JUnit test next to its package.
- A new endpoint gets its path added to `RoutingTableTest` if the prefix is new.
- A new authorization rule gets a test that proves both that the right caller is allowed and that everyone else is denied.
