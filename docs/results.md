# Results

What's been measured, how, and when. Unless it says otherwise, everything here ran on one development laptop with the services, Postgres, a kind cluster and the load generator all sharing it. Treat the numbers as a baseline for comparing runs, not a forecast for production (a 2-core arm64 node, mostly unmeasured).

Raw outputs (`report.md`, timing files, JSON) are git-ignored, so the tables here are the record. The commands to reproduce each one are at the bottom.

## Summary

| | Result | Measured |
|---|---|---|
| Model's first word on a first build | 9.1 s → 2.7 s (−70%) | build benchmark, 2026-10-08 |
| A change to a built app | 21.3 s → 11.2 s (−47%) | build benchmark, 2026-10-08 |
| Benchmark turns that ended right | 24 / 24, twice | build benchmark, 2026-10-16 |
| Generated projects that install, type-check and bundle | 20 / 20, twice, plus 3 / 3 servers that start | `scripts/bench-verify.sh`, 2026-10-16 |
| Preview first start, fresh pod | 30.1 s → 4.3 s (−86%) | `PreviewPipelineIT` on kind, 2026-10-08 |
| Read latency, 8 users at 48 req/s | p50 12 ms, p99 44 ms, 0 failed of 2,880 | `e2e/load.mjs`, 2026-10-09 |
| Read throughput at 256 in flight, 300 users | 2,794 → 3,429 req/s (+23%), p99 552 → 343 ms (−38%) | `e2e/throughput.mjs`, 2026-10-16 |
| Eight builds started at once | 8 / 8 saved, 1.1 s median pipeline overhead | `e2e/load.mjs`, 2026-10-09 |
| Preview step in the browser journey | 1 run in 10 failing → 30 / 30 passing | journey, 2026-10-10 |
| Project view script | 931 kB → 330 kB | `vite build`, rechecked 2026-11-15 |
| Lighthouse on `/login` | accessibility, best practices, SEO 100; performance 82 phone / 97 desktop | Lighthouse 12, 2026-10-09 |
| Cost of a whole pass (interview, build, change, lesson) | about 2.9 cents | provider token counts, 2026-10-09 |

## Build speed and quality

The build benchmark (`BuildBenchmarkIT`) runs fixed requests as whole build turns against the real model, in memory, with nothing saved: first builds, changes to those builds, questions, requests for another stack, and ones that need a server. Every run, with the full tables, is in [build benchmark results](practices/build-benchmark-results.md).

The 2026-10-08 round, on `gemini-3.8-flash` (medians of 8 first builds and 8 changes):

| | First word | First build | Slowest build | Change | Right | Compile |
|---|---|---|---|---|---|---|
| Before | 9.1 s | 54.8 s | 110.2 s | 21.3 s | 20 / 20 | not run |
| Reasoning effort `low` only | 2.4 s | 42.5 s | 69.9 s | 17.4 s | 20 / 20 | 16 / 16 |
| After the round | 2.7 s | 53.0 s | 61.9 s | 11.2 s | 20 / 20 | 16 / 16 |

What moved it:

- **Reasoning effort.** Most of the wait for the first word was the model reasoning before writing. Builds and repairs now run at `low` (`ai.calls.build.reasoning-effort`).
- **One fewer tool round on changes.** The project brief cut files at 12,000 characters, so nearly every change began with a round trip to fetch the one page left out. At 24,000 that round is gone, and that's most of the 21.3 → 11.2 s.
- **Scope for one-line requests.** "A pomodoro timer" went from nine files in 110 s to seven in 61 s.

The last row's first build is slower than the second's because it also writes the app's theme.

Later runs added servers to the scenarios and checked that they start. On 2026-10-16, with the repair loop on and off: 24 / 24 right both times, 20 / 20 projects compiled, 3 / 3 servers ran as one program, about 2.4 cents a turn. Change times in those runs were 12–17 s, since the scenarios got bigger. The repair loop never fired on that set, so it doesn't measure what the loop is worth.

**Not fixed.** A run on 2026-10-08 saved two first builds out of eight that didn't compile (a missing `lucide-react` icon, and `useEffect` imported from the router). The in-pod type-check catches exactly that, but only when a preview is running, and the benchmark has none. Run-to-run variation is large, so one clean run isn't proof.

## What a person waits for

Two passes in a real browser with the production models (`gemini-3.8-flash` for builds, `gemini-3.5-flash-lite` for the interview and lessons), 2026-10-09, timed from the press that started each step (`e2e/real/numbers.spec.ts`):

| Step | Pass 1 | Pass 2 |
|---|---|---|
| Idea → first interview question | 4.4 s | 3.9 s |
| Project open → first word of the build | 6.9 s | 6.8 s |
| First build, press → saved | 31.7 s | 29.0 s |
| Preview tab → app on screen | 1.2 s | 1.3 s |
| A change, press → saved | 14.4 s | 16.7 s |
| A change, press → visible in the preview | 16.4 s | 20.2 s |
| A lesson, press → first words | 1.7 s | 1.8 s |

Both passes skipped the interview questions, so the first build was small (about 3,700 tokens out, against the benchmark's ~7,800). The preview is on screen in about a second because a build request has already started it.

## Cost

Token counts are the provider's own. Prices are Google's paid tier as of 2026-10-10: `gemini-3.8-flash` $0.75 in / $3.75 out per million tokens, `gemini-3.5-flash-lite` $0.30 / $2.50. The 3.8 Flash price doubles from 2027-01-01, which doubles the build costs below.

| Call | Tokens in | Tokens out | Cost |
|---|---|---|---|
| First build, one-sentence idea | 5,284 | 3,747 | ~1.8 ¢ |
| First build, benchmark median | ~6,300 | 7,770 | ~3.4 ¢ |
| A change | 7,467 | 423 | ~0.7 ¢ |
| Interview | 996 | 288 | ~0.1 ¢ |
| Lesson | 1,455 | 199 | ~0.1 ¢ |
| **Whole pass** | 21,074 total | | **~2.9 ¢** |

A whole pass is about a fifth of the Free plan's 100,000 tokens a day.

## Previews

`PreviewPipelineIT` on the starter template, local kind cluster, 2026-10-08. Each start is timed from the request to the dev server answering through the real proxy:

| | Empty `node_modules` | Seeded `node_modules` (production) |
|---|---|---|
| First start, fresh pod | 30.1 s | **4.3 s** |
| Reinstall after a new package | 7.1 s | 6.1 s |
| Start that waited for a pod to be created | 37.9 s | 14.2 s |
| Start that fails at install | 19.2 s | 3.6 s |

The seed is an init container that copies a pre-built `node_modules` from the runner image into each warm pod while it waits. That removes about 26 of the 30 seconds. Re-runs on 2026-10-10, after the runner moved to Node 22 and the start order changed, gave 4.5–6.7 s for a seeded first start. More in [capacity](deployment/capacity.md#measured-start-times).

Production, timed by hand on 2026-10-10, took 44 s for a first start. That's slower than an unseeded laptop start, although the deployed manifests carry the seed. The cause isn't known yet.

## Under load

`e2e/load.mjs` against the whole app on one machine, 2026-10-09: eight signed-in users, each with a project, on the scripted model. It stays under the app's own rate limits on purpose, so it checks that latency stays flat with several people working. It isn't looking for a breaking point.

**Reads.** Eight users at six calls a second each for a minute: 2,880 calls through the Gateway, each with its session checked, and none failed.

| Call | p50 | p95 | p99 |
|---|---|---|---|
| `GET /api/auth/me` | 9.4 ms | 18 ms | 34 ms |
| `GET /api/projects` | 11 ms | 21 ms | 28 ms |
| `GET /api/projects/{id}/files/content` | 12 ms | 22 ms | 26 ms |
| `GET /api/chat/projects/{id}` | 21 ms | 38 ms | 46 ms |
| `GET /api/usage/today` | 26 ms | 47 ms | 57 ms |
| **All reads (9 endpoints)** | **12 ms** | **32 ms** | **44 ms** |

**Eight builds at once.** All saved. With the model's time removed (the scripted model answers instantly), parsing, checks, saving and publishing the revision took 1.1 s at the median and 1.3 s at worst.

**Four previews at once** on a warm pool of two: 4.9 s and 5.3 s for the two that got a warm pod, 8.9 s and 11.6 s for the two that waited for one.

**Rate limit.** 700 calls from one user to one service at once: 605 answered and 95 refused with `429`. The bucket is 600 per user per service, refilling at 10 a second.

### Read throughput

`e2e/throughput.mjs` against the same stack, 2026-10-16. It's a closed loop (a new call as soon as one returns), 20 s per step, from four threads of one Node process, across the same nine reads. 300 users were signed in, each paced to 20 calls a second, so no one hit the per-user rate limit. Both sides ran on freshly started services sharing the same database, Auth emulator, Gateway and sessions. No call failed in either ramp.

| In flight | Before | p99 | After | p99 |
|---|---|---|---|---|
| 16 | 2,997 req/s | 12 ms | 2,738 req/s | 13 ms |
| 32 | **3,516** | 36 ms | **3,592** | 51 ms |
| 64 | 3,273 | 86 ms | 3,377 | 96 ms |
| 128 | 3,184 | 205 ms | 3,576 | 149 ms |
| **256** | **2,794** | **552 ms** | **3,429** | **343 ms** |
| 512 | 2,846 | 932 ms | 3,388 | 719 ms |

At 256 in flight, throughput went up 23% (2,794 → 3,429 req/s) and p99 down 38% (552 → 343 ms). The peak didn't move, though. It's about 3,500 req/s at 32 in flight both before and after. What changed is what happens past it: before, throughput sagged as calls queued, and after, it holds around 3,400. The peak is the laptop itself. Its 32 logical processors were 78–85% busy at 64 in flight, and Java Flight Recorder showed no hot method in any service.

Running each read on its own (32 in flight, 20 s) found three limits below that ceiling:

| Read alone | Before | After |
|---|---|---|
| `GET /api/chat/projects/{id}` | 1,747 req/s, p99 164 ms, **91 failed** | 2,213 req/s, p99 22 ms, none failed |
| `GET /api/projects/{id}/files/content` | 339–402 req/s | 430–474 req/s |
| `GET /api/usage/today` | 1,329 req/s, p99 34 ms | 1,040–1,098 req/s, p99 51–58 ms |

- **Feign opened a new connection for almost every call.** Without `feign-hc5` on the classpath, OpenFeign fell back to `HttpURLConnection`. Closed connections piled up in TIME_WAIT (4,862 toward workspace-service in one snapshot) until the machine ran out of local ports and calls failed with `BindException`. Feign now uses a pooled Apache HttpClient 5 that drops idle connections after 15 s ([pitfall](practices/gotchas/microservices-and-build.md#feign-falls-back-to-a-client-with-no-pool)).
- **A file read held a database connection through its whole storage call.** A thread dump at the file-read ceiling had 22 of 32 request threads waiting in `HikariPool.getConnection` and the other 10 in `MinioClient.getObject`. Spring's open-in-view kept the permission check's connection for the entire request. It's off in workspace-service now, and the same dump afterwards had no thread waiting for a connection ([pitfall](practices/gotchas/spring-and-jpa.md#open-in-view-holds-a-connection-through-everything-else-a-request-does)).
- **The MinIO client ran five calls at a time.** With the pool fixed, the dump showed every busy thread parked on the MinIO SDK, which sends calls through OkHttp's dispatcher at 5 per host by default. It now allows 64 ([pitfall](practices/gotchas/microservices-and-build.md#the-minio-client-runs-five-calls-at-a-time)). File reads only reached about 450 req/s because MinIO sits behind a `kubectl port-forward` on this laptop.

One read got slower. `GET /api/usage/today` makes two Feign calls and is about 17% slower on the pooled client. That trade was kept, because the old client failed outright under load and the mixed ramp, which includes this read, is no slower.

### A race the load test found

The first time eight builds started together, one died with a `500`: two threads were writing the same streamed response's headers. It's fixed and written up in [pitfalls](practices/gotchas/spring-and-jpa.md#security-headers-written-while-a-streamed-response-has-already-begun), and the numbers above are from after the fix.

## Flakiness

About one browser-journey run in ten, the Preview tab showed the starter placeholder (or a blank page) while the pod held the built app. A two-second scripted build was landing while the dev server was still starting. There were three causes, each found in pod logs: a dependency scan reading a half-written file, a page that missed the dev server's reload, and a port-forward replaced because one connection through it failed. After all three fixes the preview step passed 30 runs out of 30, where the same 30 had failed twice with each partial fix. The write-up is in [pitfalls](practices/gotchas/kubernetes.md#a-build-that-lands-while-the-dev-server-is-starting).

## Frontend

The project view used to be one 931 kB script. The editor, Markdown renderer and charts are now separate chunks that only the pages using them load, and React has its own chunk so it stays cached across releases. In today's build the project view is 330 kB (99 kB gzipped), and the entry script is 238 kB plus React at 145 kB.

Lighthouse 12 on the production build behind the same nginx config a deploy uses, 2026-10-09:

| Page | As | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|
| `/login` | phone, slow 4G | 82 | 100 | 100 | 100 |
| `/login` | desktop | 97 | 100 | 100 | 100 |

CI enforces floors of 95 / 95 / 90 on accessibility, best practices and SEO. Performance is reported but not enforced, since it depends on the machine.

## Tests and coverage

| Suite | Size |
|---|---|
| Backend (`./mvnw test`) | 1,623 tests: common-lib 37, gateway 95, account 75, workspace 732, intelligence 684 |
| Frontend (Vitest) | 931 tests in 75 files |
| Preview proxy (`node --test`) | 92 tests |
| Starter launcher | 8 tests |
| Real preview on kind (`PreviewPipelineIT`) | 11 steps |
| Real publish on kind (`PublishPipelineIT`) | 6 steps |
| Browser journeys (Playwright) | 17 steps for one user, 7 for two users sharing a project |

Line coverage from `./mvnw verify` on 2026-11-15 is 75.4% for the whole backend: intelligence 82.2%, workspace 80.3%, account 51.7%, common-lib 29.2%. Frontend `src/lib`, where the logic lives, is at 77.4% lines and 88.4% branches. Each module has a floor just under its number, and the build fails beneath it.

## Not measured

- **Production**, beyond the hand-timed starts above.
- **Publishing with a real model's build.** The journey publishes the scripted notes app in a median 8.5 s over 29 runs. `PublishPipelineIT` publishes the starter in 16 s with the seed.
- **More than eight users building or previewing at once**, or a run long enough to show a leak. Reads have been run with 300 users.
- **The model's own variance.** These are two browser passes and one benchmark run per configuration.

## Reproducing

```bash
./mvnw -DskipTests package
e2e/stack.sh up --context kind-singularity                  # whole app, scripted model
(cd e2e && npm ci && npx playwright install chromium)
(cd e2e && npm run load)                                    # load test
(cd e2e && npm run throughput -- --users 300 --steps 16,32,64,128,256,512)   # read ramp; first run signs in for ~30 min
e2e/stack.sh down --context kind-singularity

e2e/stack.sh up --context kind-singularity --real-ai .env   # real model, spends tokens
(cd e2e && npm run numbers)                                 # one browser pass, ~21k tokens
e2e/stack.sh down --context kind-singularity

./mvnw -pl common-lib,intelligence-service test -Dtest=BuildBenchmarkIT -Dsurefire.failIfNoSpecifiedTests=false \
  "-DargLine=-Dbench.out=C:/path/to/out -Dbench.label=gemini-3.8-flash"
scripts/bench-verify.sh C:/path/to/out

k8s/preview-test-cluster.sh --context kind-singularity --seed
./mvnw -pl common-lib,workspace-service test -Dtest=PreviewPipelineIT -Dsurefire.failIfNoSpecifiedTests=false
```

Coverage and Lighthouse are described in [testing](practices/testing.md#coverage).
