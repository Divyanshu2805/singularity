# Migration Map: Monolith → Microservices

This is the running record of **what moved where, and when**, as VibeCraft migrates from a single Spring Boot backend into the microservices split described in the original architecture draft (Account / Workspace / Intelligence services, a Gateway, a shared `common-lib`). Read this before assuming a class or endpoint still lives where `docs/architecture/`'s pre-migration description says it does.

Updated in the same change as every migration phase — not written once at the end. See `docs/architecture/system-context.md` §1 for the current system-context picture and the migration plan (`glistening-swinging-crane.md`, kept outside the repo) for the full phase-by-phase design and the reliability strategy governing how each cutover happens.

## Contents

- [How to read this](how-to-read.md)
- [Phase 0 — Scaffolding (complete)](phase-0-scaffolding.md)
- [Phase 1 — Account Service (built and verified standalone; **not yet receiving real traffic**)](phase-1-account-service.md)
- [Phase 2 — Workspace Service (built and verified standalone; **not yet receiving real traffic**)](phase-2-workspace-service.md)
- [Phase 3 — Intelligence Service (not started)](phase-3-intelligence-service.md)
- [Not yet moved](not-yet-moved.md)
