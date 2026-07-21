# Testing Expectations

- Backend tests are plain JUnit, deliberately **not** `@SpringBootTest` (see the timezone gotcha above) — new business logic that can be tested without a Spring context should be. Run new/changed tests by name; don't assume the bare `./mvnw test` result means anything.
- Frontend: Vitest + Testing Library. Most of the 282 existing tests target `lib/` (framework-free logic) directly rather than rendered components — prefer that shape for new logic too, since it doesn't need jsdom quirks worked around.
- **Neither the Kubernetes/Redis-backed live-preview pipeline nor Stripe billing has automated coverage today** — both are verified by hand (`curl`/Postman, or a real `spring-boot:run` against a live cluster). If you're touching either, verify against the real thing before calling a change done; don't assume a clean `mvnw test` run means it works.
- If you add a value to any persisted enum, check `\d <table>` on the dev database in the same change — see the `ddl-auto` gotcha above.
