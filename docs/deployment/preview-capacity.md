# Preview capacity

With the settings below, up to 6 previews can run at once, and 1–2 can start at the same moment comfortably. For 50 occasional users, realistic overlap is 2–5. These are estimates from the manifests; Phase 6 replaces them with measured numbers.

- **Memory:** of 12 GB, the rest of the app uses about 5.5 GB, leaving about 6.5 GB for previews. A running preview uses roughly 250–400 MB and can hit its ~1.1 GB cap during `npm install`.
- **CPU is the real limit, for starting rather than running:** each start runs `npm install` from an empty cache, which can use a full core for about 30–90 seconds, and the machine has 2 cores.
- **When full,** users see "Every preview runner is busy right now. Try again in a minute." Collaborators on one project share its preview, and idle previews stop after 10 minutes.

| Setting | Value | Why |
| --- | --- | --- |
| Warm pool (`runner-pool` replicas) | 1, down from 2 | The first start is still instant, and it saves memory |
| Max preview pods (namespace quota) | 7: 1 warm + 6 active | Previews can never starve the Java services |
| CPU priority | Java services above previews | The site stays responsive while previews start |
| `preview.boot-timeout` | 4 min, up from 2 | Slow installs on 2 cores don't fail |
| `preview.idle-timeout` | 10 min (unchanged) | Frees slots quickly |
| Pre-baked runner image | Built and rehearsed in Phase 7, live with the next deploy | `npm install` 41 s → 1 s on the kind rehearsal |
