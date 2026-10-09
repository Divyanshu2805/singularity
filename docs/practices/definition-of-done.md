# Definition of Done

A change is done when every item that applies is true:

- [ ] **The relevant tests pass**, run by name — not just an unchanged full-suite result. New behaviour has new tests ([testing](testing.md)).
- [ ] **The touched backend service actually boots** with `./mvnw -pl <module> spring-boot:run`. A green test run doesn't prove that the Spring context starts.
- [ ] **The frontend typechecks, lints and builds** (`npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npm run build`) if frontend code changed.
- [ ] **`RoutingTableTest` passes** if an endpoint or route changed.
- [ ] **A schema change has its Flyway migration** and the entity changed in the same commit.
- [ ] **The browser journey passes** (`e2e/`, [how](testing.md#the-browser-journey)) if the change crosses a service boundary or touches sign-in, the chat, the preview panel or lessons.
- [ ] **`./mvnw verify` passes**, not only `test`, if backend code changed: it is where each module's coverage floor is checked.
- [ ] **`PreviewPipelineIT` passes on kind** if the preview pipeline or the proxy changed ([how](testing.md#the-preview-pipeline-test)).
- [ ] **`PublishPipelineIT` passes on kind** if publishing, `proxy/published*.js` or `proxy/s3.js` changed ([how](testing.md#the-publish-pipeline-test)).
- [ ] **Hand-verified areas were verified by hand** — the Preview tab in a browser ([checklist](../local-development/preview-checklist.md)), the Publish panel and share page ([checklist](../local-development/publish-checklist.md)), billing, backup and restore — if the change touched them.
- [ ] **No security guardrail was weakened** ([guardrails](security-guardrails.md)).
- [ ] **Every doc the change makes inaccurate is updated in the same change** — architecture, API reference, data model, local development, deployment, operations, or `CLAUDE.md`.
