# Known gaps

| Area | Gap |
|---|---|
| Builds | Nothing runs the app before saving, so runtime errors get through. The preview offers **Fix this** for them |
| Builds | The type-check only runs while a preview is up, and only looks at files the turn wrote |
| Builds | A killed process loses the turn in progress |
| Builds | The build model gets no prompt-cache hits |
| Files | No rename or move. A hand edit made during someone else's build can be overwritten by that build |
| Files | Blobs are never garbage-collected. A crash mid-publish leaves a revision in `STAGING` |
| Collaboration | Invites aren't emailed. Ownership can't be transferred |
| Previews | One stack only: React + Vite, plus an optional Node server with SQLite |
| Previews | A project's server only runs in its preview, not in the published app. Changing a table clears its data |
| Publishing | One live version, no custom domains, no rollback |
| GitHub | One-way push that overwrites. The `repo` scope is broader than needed |
| Platform | One node, so losing it means restoring from backup (1–2 h) |
| Platform | Some state is per process (session cache, rate limits, preview lock, running turns), so each service runs as one replica |
| Platform | Network policies between trusted pods are applied by hand. Eureka and Redis have no passwords |
| Platform | Runner pods can reach any public host on 80/443, because npm needs it |
| Platform | Production preview starts were hand-timed at 44 s against 4.3 s on the laptop, cause not found yet |
