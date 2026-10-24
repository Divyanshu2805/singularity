# Results

Measured on a development laptop with the services, Postgres, a kind cluster and the load generator on the same machine.

## Summary

| | Before | After |
|---|---|---|
| Model's first word on a build | 9.1 s | **2.7 s** (−70%) |
| A change to a built app | 21.3 s | **11.2 s** (−47%) |
| Preview start, fresh pod | 30.1 s | **4.3 s** (−86%) |
| Read throughput, 256 in flight | 2,794 req/s | **3,429 req/s** (+23%) |
| p99 at 256 in flight | 552 ms | **343 ms** (−38%) |
| Preview step in the browser E2E test | fails 1 in 10 | **30 / 30** |

## Build speed

`BuildBenchmarkIT` runs fixed requests as whole build turns against the real model (`gemini-3.8-flash`). Numbers are medians of 8 first builds and 8 changes.

| | First word | First build | Change |
|---|---|---|---|
| Before | 9.1 s | 54.8 s | 21.3 s |
| Low reasoning effort | 2.4 s | 42.5 s | 17.4 s |
| + one fewer fetch round | 2.7 s | 53.0 s | 11.2 s |

- **Reasoning effort.** Most of the wait for the first word was the model reasoning before it wrote anything. Builds and repairs now run at `low`.
- **The fetch round.** The prompt cut files at 12,000 characters, so most changes started with an extra round trip to read one page. Raising the limit to 24,000 removed it.

## Build quality

| | |
|---|---|
| Turns that ended right | 24 / 24 |
| Generated projects that install, type-check and bundle | 20 / 20 |
| Generated servers that start and answer | 3 / 3 |
| Cost per full pass (interview, build, change, lesson) | ~3 cents |

`scripts/bench-verify.sh` compiles every generated project in a throwaway container and starts any server it has.

## Preview start

`PreviewPipelineIT` on kind, from the start request to the dev server answering through the proxy.

| | Empty `node_modules` | Seeded |
|---|---|---|
| First start | 30.1 s | **4.3 s** |
| Reinstall after a new package | 7.1 s | 6.1 s |
| Waited for a new pod | 37.9 s | 14.2 s |

Warm pods get a pre-built `node_modules`, copied in by an init container while they wait.

## Throughput

`e2e/throughput.mjs`: 300 signed-in users, each paced under the rate limit, in a closed loop of nine reads. No call failed on either side.

| In flight | Before | p99 | After | p99 |
|---|---|---|---|---|
| 32 | 3,516 req/s | 36 ms | 3,592 req/s | 51 ms |
| 128 | 3,184 | 205 ms | 3,576 | 149 ms |
| **256** | **2,794** | **552 ms** | **3,429** | **343 ms** |
| 512 | 2,846 | 932 ms | 3,388 | 719 ms |

The peak (~3,500 req/s) is the laptop's CPU and didn't move. What changed is that throughput no longer sags past it. Thread dumps and socket stats found three limits:

| Problem | Fix |
|---|---|
| Feign opened a new connection per call, until the machine ran out of ports | Pooled Apache HttpClient 5 |
| A file read held a DB connection through its whole MinIO call (22 of 32 threads waiting on Hikari) | `open-in-view: false` in workspace-service |
| The MinIO client ran 5 calls at a time | Dispatcher raised to 64 |

At normal load (8 users, 48 req/s) every read stays under 44 ms at p99.

## Flaky preview

Roughly 1 in 10 browser-test runs showed the template instead of the built app. Pod logs showed three causes: a dependency scan reading a half-written file, a page that missed the dev server's reload, and a port-forward replaced after a single failed connection. After fixing all three it passed 30 / 30.

## Tests

| Suite | Count |
|---|---|
| Backend | 1,623 |
| Frontend | 931 |
| Preview proxy | 92 |
| Real preview + publish on kind | 17 steps |
| Browser journeys | 2 journeys, 24 steps |

Line coverage is 75.4% for the backend and 77.4% for the frontend's logic. CI fails the build if a module drops below its floor.
