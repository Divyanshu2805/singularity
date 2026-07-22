# Running the Backend Test Suite

```bash
./mvnw test                                      # every module (113 tests: common-lib 14, gateway 60, account 9, workspace 24, intelligence 6)
./mvnw -pl common-lib,workspace-service test     # one service, as a reactor with common-lib (see the shared ~/.m2 jar problem below)
./mvnw -pl <module> test -Dtest=ClassName        # one test class
```

The service tests are plain JUnit with no Spring context, so none of them need a running database, cluster or Docker — and the Windows timezone problem below can't affect them. The Gateway's `RoutingTableTest` is the one `@SpringBootTest`, and it needs no database (Eureka is switched off for it). If you add a test that starts a Spring context against Postgres, read the first row of [Common Problems](troubleshooting.md#common-problems) first.

```bash
cd frontend
npm test          # 282 tests across 28 files, vitest
npx tsc --noEmit  # typecheck only
npm run build     # production build — watch for the "chunks larger than 500kB" warning, see TODO.md
```
