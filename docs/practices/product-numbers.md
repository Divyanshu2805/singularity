# The Product's Numbers

What has been measured, where each number came from, and how to measure it again. Nothing here is an estimate: a number with no measurement behind it is listed under [not measured](#not-measured) instead.

Everything on this page was measured on one development laptop, with the services, the database, a kind cluster and the load generator all sharing it. Treat the numbers as a floor for comparing one run with the next, not as a forecast of production, which runs on a 2-core arm64 node and has not been measured since these changes.

## What a person waits for

Two passes through the product in a real browser with the configured model (`gemini-3.8-flash` with low reasoning for builds, `gemini-3.5-flash-lite` for the interview and lessons), 2026-10-09, each timed from the press that started the step (`e2e/real/numbers.spec.ts`). Beside them, the medians of the [build benchmark](build-benchmark-results.md), which runs twenty turns without a browser.

| Step | Pass 1 | Pass 2 | Benchmark median |
|---|---|---|---|
| Idea submitted to the first interview question | 4.4 s | 3.9 s | - |
| Project open to the first word of the build | 6.9 s | 6.8 s | 2.7 s to the model's first word |
| First build, press to saved | 31.7 s | 29.0 s | 53.0 s |
| Preview tab pressed to the app on screen | 1.2 s | 1.3 s | - |
| A change, press to saved | 14.4 s | 16.7 s | 11.2 s |
| A change, press to the running preview showing it | 16.4 s | 20.2 s | - |
| A lesson, press to its first words | 1.7 s | 1.8 s | - |
| A lesson, press to complete | about 2 s | 2.9 s | - |

How to read these:

- **The first build here is a small one.** Both passes skipped the interview's questions, so the build had a one-sentence idea and wrote about 3,700 tokens. The benchmark's eight first builds are from fuller briefs and write about 7,800, which is why its median is longer. Neither is wrong; they are different requests.
- **"First word" in the browser is later than the model's first word.** The browser's clock starts when the project page opens and stops when the thought process is drawn; the benchmark's stops at the first byte from the provider.
- **The preview is on screen in about a second because it is already starting.** A build request starts the preview so the compiler check can run, so by the time a 30-second build is saved the runner is up. Started cold on a pool with pre-installed packages, a first start is 4.3 s ([capacity](../deployment/capacity.md#measured-start-times)); with the scripted model, whose build takes two seconds, the journey test sees the app about 8 s after the tab is pressed.
- **Two passes are two samples.** At temperature zero a one-sentence change to the prompt moves a build by seconds. Rerun before believing a small difference.

## What a build costs

Tokens are the provider's own counts, from the usage the app meters for each call.

| Call | Model | Tokens in | Tokens out | Cost |
|---|---|---|---|---|
| First build, one-sentence idea (pass 1) | `gemini-3.8-flash` | 5,284 | 3,747 | about 1.8 cents |
| First build, benchmark median | `gemini-3.8-flash` | about 6,300 | 7,770 | about 3.4 cents |
| A change (pass 1) | `gemini-3.8-flash` | 7,467 | 423 | about 0.7 cents |
| The interview | `gemini-3.5-flash-lite` | 996 | 288 | about 0.1 cents |
| A lesson | `gemini-3.5-flash-lite` | 1,455 | 199 | about 0.1 cents |
| Suggested next steps | `gemini-3.5-flash-lite` | 572 | 31 | under 0.1 cents |
| **A whole pass**: interview, build, change, lesson, suggestions | | 21,074 tokens in all | | **about 2.9 cents** |

**The cost column rests on prices this project did not verify.** They are $0.75 in and $3.75 out per million tokens for `gemini-3.8-flash` and $0.30 and $2.50 for `gemini-3.5-flash-lite`, as third-party pricing guides reported them in October 2026; one aggregator listed half that for 3.8 Flash, and the guides call the rate introductory until the end of 2026. Check Google's own pricing page before quoting a cost, and multiply the token columns by whatever it says. The token counts are measured and do not depend on it.

On the Free plan's 100,000 tokens a day, a whole pass is about a fifth of the allowance.

## Whether a build is right

From the [build benchmark](build-benchmark-results.md), last run of 2026-10-08:

| | |
|---|---|
| Turns that ended the way their kind should, with nothing for the server to add | 20 of 20 |
| Built projects that install, type-check and bundle (`scripts/bench-verify.sh`) | 16 of 16 |

One earlier run of the same day saved two builds of eight that did not compile; see that page for why one clean run is not a guarantee.

## Under load

`e2e/load.mjs` against the whole application on one machine, 2026-10-09: eight signed-in people, each with a project, the scripted model. It stays under the app's own rate limits on purpose, so it is a check that latency stays flat with several people working, not a search for the breaking point.

**Reads.** Eight people making six calls a second each for a minute: 2,880 calls, 48 a second, none failed.

| Call | p50 | p95 | p99 | Slowest |
|---|---|---|---|---|
| `GET /api/auth/me` | 9.4 ms | 18 ms | 34 ms | 43 ms |
| `GET /api/me/subscription` | 11 ms | 23 ms | 30 ms | 41 ms |
| `GET /api/plans` | 7.9 ms | 17 ms | 23 ms | 42 ms |
| `GET /api/projects` | 11 ms | 21 ms | 28 ms | 32 ms |
| `GET /api/projects/{id}` | 12 ms | 22 ms | 28 ms | 29 ms |
| `GET /api/projects/{id}/files` | 10 ms | 20 ms | 26 ms | 35 ms |
| `GET /api/projects/{id}/files/content` | 12 ms | 22 ms | 26 ms | 29 ms |
| `GET /api/chat/projects/{id}` | 21 ms | 38 ms | 46 ms | 54 ms |
| `GET /api/usage/today` | 26 ms | 47 ms | 57 ms | 62 ms |
| **All reads** | **12 ms** | **32 ms** | **44 ms** | 62 ms |

Every one of these passes through the Gateway and has its session checked.

**Eight builds at the same moment.** All eight saved. With the model's time taken out (the scripted model answers at once), the pipeline's own work - parsing, the syntax and import checks, saving, publishing a revision - took 1.1 s at the median and 1.3 s at worst, and the first piece of the answer left the server after 33 ms.

**Four previews at the same moment**, against a warm pool of two runners:

| Person | Waited in line | To the page answering through the proxy |
|---|---|---|
| 1 | no | 4.9 s |
| 2 | no | 5.3 s |
| 3 | yes | 8.9 s |
| 4 | yes | 11.6 s |

Then 200 loads of a running preview's page through the proxy, four at a time: 26 ms at the median, 38 ms at p95, 169 ms at p99, none failed.

**The rate limit holds.** One person sending 700 calls to one service at once got 605 answers and 95 refusals (`429`). The limit is a bucket of 600 per person per service that refills at ten a second, which is where the five extra come from.

**What the load test found.** The first time eight builds were started together, one failed before it began: a `500`, and an `ArrayIndexOutOfBoundsException` inside the servlet container. Two threads were writing the same response's headers. It is fixed and written up in [pitfalls](gotchas/spring-and-jpa.md#security-headers-written-while-a-streamed-response-has-already-begun); the runs above are after the fix.

## What the browser journey found

The [journey test](testing.md#the-browser-journey) runs the product the way a person does, and about one run in ten the Preview tab came up on the starter template's placeholder, or blank, while the runner pod held the built app. The build's files had arrived while the preview's dev server was still starting. One form of it is fixed - the panel now reloads a frame that loaded just before the files changed - and the other is a [known gap](../known-gaps/constraints-and-trade-offs.md#a-build-saved-while-its-preview-is-starting) with its cause written down; the test presses Reload when it meets it and says so in its report.

## The public pages

Lighthouse 12 on the production build, served by the nginx image and configuration a deploy uses, 2026-10-09 (`e2e/lighthouse.mjs`):

| Page | As | Performance | Accessibility | Best practices | SEO | First paint | Largest paint |
|---|---|---|---|---|---|---|---|
| `/` | Phone on slow 4G | 36 | 100 | 100 | 100 | 3.7 s | 6.1 s |
| `/` | Desktop | 68 | 100 | 100 | 100 | 0.8 s | 1.3 s |
| `/login` | Phone on slow 4G | 82 | 100 | 100 | 100 | 3.1 s | 3.9 s |
| `/login` | Desktop | 97 | 100 | 100 | 100 | 0.9 s | 0.9 s |

Accessibility, best practices and SEO are enforced in CI (floors of 95, 95 and 90). Performance is reported and not enforced: it is a simulated slow phone on whatever machine runs it, and the landing page's score is its animation - 1.4 s of blocked main thread on that simulated phone. The landing page is being rebuilt; that number is the one to beat.

**What a visitor downloads.** The project view was one 931 kB script. The code editor, the Markdown renderer and the charts are now files of their own that only the pages using them load, and the server compresses text:

| | Before | After |
|---|---|---|
| The project view's own script | 931 kB | 223 kB |
| The entry script every page loads | 351 kB | 208 kB and React at 145 kB - the same in total, but React's file no longer changes with a release |
| The code editor, as sent | 551 kB | 188 kB compressed |

## How much of the code the tests run

| | Lines | Branches |
|---|---|---|
| Backend, all modules | 67.2% | 66.5% |
| - intelligence-service (the build pipeline) | 80.1% | 76.3% |
| - workspace-service (projects, files, previews) | 64.1% | 60.0% |
| - account-service (sessions, billing) | 43.5% | 29.6% |
| - common-lib (the shared security kit) | 29.3% | 33.6% |
| Frontend, `src/lib` - where the logic and the tests are | 77.5% | 87.3% |
| Frontend, the whole app | 27.3% | 84.0% |

The whole-app figure for the frontend is low because most of the rest is the landing page and the sign-in screens, which are checked by eye and by the browser journey rather than rendered in unit tests. Each backend module and both frontend figures have a floor a little under these, and the build fails beneath it ([testing](testing.md#coverage)).

| Suite | Size |
|---|---|
| Backend | 1,308 tests |
| Frontend | 845 tests |
| Preview proxy | 30 tests |
| A real preview on a cluster | 9 steps on one project |
| The browser journey | 12 steps, about 35 s |

## Not measured

- **Production.** Every time on this page is a laptop's. Production also runs behind a tunnel and on a slower node.
- **Time to publish an app.** Publishing is on its own branch and was not part of this build.
- **More than eight people at once**, or a run long enough to show a leak. The rate limits cap what one address can send, so a larger test needs many addresses or the limits raised for the run.
- **The model's own variation.** Two browser passes and one benchmark run per configuration.

## Measuring again

```bash
./mvnw -DskipTests package
e2e/stack.sh up --context kind-singularity                              # the whole application, scripted model
(cd e2e && npm ci && npx playwright install chromium)
(cd e2e && npm run load)                                                # the load test
e2e/stack.sh down --context kind-singularity

e2e/stack.sh up --context kind-singularity --real-ai .env               # the configured model: spends tokens
(cd e2e && npm run numbers)                                             # one pass, about 21,000 tokens
e2e/stack.sh down --context kind-singularity
```

Lighthouse and coverage are described in [testing](testing.md). The build benchmark has [its own section](testing.md#the-build-benchmark) there.
