# Things to Avoid

- Don't hand-edit a Hibernate-managed table's constraints directly without also fixing the entity/config that would keep regenerating the wrong one.
- Don't widen `@PreAuthorize` gates or CORS/CSP exemptions to unblock a feature — flag it instead of loosening a security boundary to make something pass.
- Don't add a second file-storage abstraction, a second highlighting library, or a second diff implementation where one already exists and is documented in `docs/architecture/` — this codebase has already paid down duplication like this once (`FileService` vs. `ProjectFileService`) and the lesson was expensive enough to be worth not repeating.
- Don't commit real secrets, a working credential default, or a `.env`/`.env.local` file. `.gitignore` already covers the obvious ones — check it covers a new secret before assuming it's safe.
- Don't treat `TODO.md`'s contents as this file's job to duplicate. Known gaps and deferred ideas live there; this file is about how to work here safely and correctly *today*.
