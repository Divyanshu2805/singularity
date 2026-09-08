# Definition of Done

A change is done when: the relevant tests pass (named, not necessarily the bare full suite — see Testing Expectations), the touched service actually boots (`./mvnw -pl <module> spring-boot:run`, not just a green test run) if backend code changed, the frontend builds and typechecks if frontend code changed, and every doc this change makes inaccurate — `docs/architecture/`, `docs/schema/`, `docs/api/`, `docs/local-development/`, `docs/operations/`, or this file — has been updated in the same change.
