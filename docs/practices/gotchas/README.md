# Known Pitfalls

Traps this stack has actually hit. Most fail **silently** — no compile error, no startup warning, just wrong behaviour — which is why they're written down. Each entry gives the symptom, the cause and the fix.

| Page | Covers |
|---|---|
| [Spring and JPA](spring-and-jpa.md) | Security expressions, bean registration, Lombok, Flyway, Spring AI streams, JPA upserts, native queries, test slices |
| [Microservices and build](microservices-and-build.md) | Feign and the internal API, the shared `common-lib` jar, dependency management, permission-guard placement |
| [Kubernetes](kubernetes.md) | fabric8 client, RBAC, pod security, service links, Kustomize, MinIO, Secrets, Jobs and CronJobs, ConfigMaps, quotas, runner namespaces and who writes into a runner |
| [CI and tooling](ci-and-tooling.md) | GitHub Actions, Tailscale, GHCR and the MinIO image mirror, Windows shells, operator scripts |
| [AI generation](ai-generation.md) | The output grammar and its two parsers, what a model does with a prompt, tag names a model will not write, what it reads last, what a tool hands it, calls within a turn, retries and repairs, timeouts, the end of a stream |

A recurring lesson across all five: **a passing check is not proof the operation happened.** A green CI step that retried and exited `0`, a clean `mvnw package`, a `kubectl exec` run as a different identity — each of these has hidden a real failure here. Verify the effect, not the exit code.
