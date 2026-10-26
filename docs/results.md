# Results

All of this was measured on one development laptop, with the services, Postgres, a kind cluster and the load generator on the same machine.

| What improved | From | To | What changed |
|---|---|---|---|
| Wait for the model's first word on a build | 9.1 s | 2.7 s | Builds run at low reasoning effort |
| Time to apply a change to a built app | 21.3 s | 11.2 s | The prompt shows whole files up to 24,000 characters, so the model no longer fetches the page it needs first |
| Preview start in a fresh pod | 30.1 s | 4.3 s | Warm pods come with `node_modules` already installed |
| Read throughput, 256 requests in flight | 2,794 req/s | 3,429 req/s | Three connection limits fixed (below) |
| p99 latency at the same load | 552 ms | 343 ms | Same fixes |

## Build speed

`BuildBenchmarkIT` runs a fixed set of build requests against the real model (`gemini-3.8-flash`) and times each turn. These are medians of 8 first builds and 8 follow-up changes.

| Setup | First word | First build | Change |
|---|---|---|---|
| Default reasoning effort | 9.1 s | 54.8 s | 21.3 s |
| Low reasoning effort | 2.4 s | 42.5 s | 17.4 s |
| Low effort, plus no extra fetch round | 2.7 s | 53.0 s | 11.2 s |

The last row's first build is slower than the second because the prompt also started asking for the app's theme.

## Build quality

| | |
|---|---|
| Benchmark turns that ended the way they should | 24 / 24 |
| Generated projects that install, type-check and bundle | 20 / 20 |
| Generated servers that start and answer requests | 3 / 3 |
| Model cost of a full pass (interview, build, change, lesson) | about 3 cents |

`scripts/bench-verify.sh` builds each generated project in a throwaway container and starts any server it has.

## Preview start

Measured by `PreviewPipelineIT` on kind, from the start request until the dev server answers through the proxy.

| | Without pre-installed packages | With them |
|---|---|---|
| First start | 30.1 s | 4.3 s |
| Reinstall after adding a package | 7.1 s | 6.1 s |
| Start that had to wait for a new pod | 37.9 s | 14.2 s |

## Throughput

`e2e/throughput.mjs` signs in 300 users and keeps a fixed number of requests in flight across nine read endpoints. Each user stays under the rate limit, and no request failed in any run.

| Requests in flight | Before | p99 | After | p99 |
|---|---|---|---|---|
| 32 | 3,516 req/s | 36 ms | 3,592 req/s | 51 ms |
| 128 | 3,184 req/s | 205 ms | 3,576 req/s | 149 ms |
| 256 | 2,794 req/s | 552 ms | 3,429 req/s | 343 ms |
| 512 | 2,846 req/s | 932 ms | 3,388 req/s | 719 ms |

The peak, about 3,500 req/s, is set by the laptop's CPU and stayed the same. The fixes stopped throughput from falling once requests started queuing. Thread dumps and socket stats found the limits:

| Problem | Fix |
|---|---|
| Feign opened a new connection for every call, until the machine ran out of ports | Pooled Apache HttpClient 5 |
| A file read held a database connection for its whole MinIO call, leaving 22 of 32 threads waiting | `open-in-view` turned off in workspace-service |
| The MinIO client ran only 5 calls at a time | Raised to 64 |

## Tests

| Suite | Count |
|---|---|
| Backend | 1,623 |
| Frontend | 931 |
| Preview proxy | 92 |
| Real preview and publish on kind | 17 steps |
| Browser journeys | 2 journeys, 24 steps |

Backend line coverage is 75.4%, and the frontend's logic is at 77.4%. CI fails if a module drops below its floor.
