# Definition of Done

A change is done when every item that applies is true:

- [ ] **The relevant tests pass**, run by name — not just an unchanged full-suite result. New behaviour has new tests ([testing](testing.md)).
- [ ] **The touched backend service actually boots** with `./mvnw -pl <module> spring-boot:run`. A green test run doesn't prove that the Spring context starts.
- [ ] **The frontend typechecks, lints and builds** (`npx tsc --noEmit`, `npm run lint`, `npm run build`) if frontend code changed.
- [ ] **`RoutingTableTest` passes** if an endpoint or route changed.
- [ ] **A schema change has its Flyway migration** and the entity changed in the same commit.
- [ ] **Hand-verified areas were verified by hand** — previews, billing, backup and restore — if the change touched them.
- [ ] **No security guardrail was weakened** ([guardrails](security-guardrails.md)).
- [ ] **Every doc the change makes inaccurate is updated in the same change** — architecture, API reference, data model, local development, deployment, operations, or `CLAUDE.md`.
