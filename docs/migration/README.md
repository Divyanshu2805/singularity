# Migration Map: Monolith → Microservices

This is the running record of **what moved where, and when**, as VibeCraft migrates from a single Spring Boot backend into the microservices split described in the original architecture draft (Account / Workspace / Intelligence services, a Gateway, a shared `common-lib`). Read this before assuming a class or endpoint still lives where `docs/architecture/`'s pre-migration description says it does.

Updated in the same change as every migration phase — not written once at the end. See `docs/architecture/system-context.md` §1 for the current system-context picture and the migration plan (`glistening-swinging-crane.md`, kept outside the repo) for the full phase-by-phase design and the reliability strategy governing how each cutover happens.

## Contents

- [How to read this](how-to-read.md)
- [Where things stand (after Phase 5 and the removal of the monolith, 2026-08-11)](status.md)
- [Phase 0 — Scaffolding (complete)](phase-0-scaffolding.md)
- [Phase 1 — Account Service (built and verified standalone; cut over in Phase 4)](phase-1-account-service.md)
- [Phase 2 — Workspace Service (built and verified standalone; cut over in Phase 4)](phase-2-workspace-service.md)
- [Phase 3 — Intelligence Service (built and verified standalone; cut over in Phase 4)](phase-3-intelligence-service.md)
- [Phase 4 — Cutover (traffic now runs through the three services; `legacy-monolith` was kept as rollback until it was removed on 2026-08-11)](phase-4-cutover.md)
- [Not yet moved](not-yet-moved.md)
