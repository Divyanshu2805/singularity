# Tech Stack

**Backend:** Java 25, Spring Boot 4.1 (Web MVC, Data JPA, Security), PostgreSQL, Maven (via `mvnw`/`mvnw.cmd` — never a system Maven install), Lombok, MapStruct, Spring AI (OpenRouter via its OpenAI-compatible API), Firebase Admin SDK (the only sign-in method), Stripe Java SDK, MinIO Java SDK, fabric8 `kubernetes-client`, Spring Data Redis.

**Frontend:** React 18 + TypeScript, Vite 5, Tailwind CSS + shadcn/ui (Radix primitives), `@tanstack/react-query`, CodeMirror 6, Firebase JS SDK, Vitest + Testing Library.

Full dependency list with the *why* behind each non-obvious one: `docs/architecture/system-context.md` §1, `pom.xml`/`frontend/package.json` comments.
