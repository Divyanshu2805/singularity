# Capacity

How the 12 GB, 2-core machine is shared, and how many previews fit.

## Measured baseline

With the stack idle and one warm runner pod, `kubectl top` reports:

| | Usage |
|---|---|
| Node | about 3.3 GB of 12 GB (27%), 4% CPU |
| Java services | 231–489 Mi each (workspace 489, intelligence 438, account 376, gateway 245, discovery 231), against limits of 384–640 Mi |
| Postgres / MinIO | about 101 Mi / 109 Mi |
| Namespace quotas | `vibecraft` 4.0 of 8 Gi memory and 5.7 of 8 CPU limits; `vibecraft-ai` 1.5 of 12 Gi with one warm runner |

## Previews

- **Up to 6 previews can run at once**, and 1–2 can *start* at the same moment comfortably. For an audience of about 50 occasional users, realistic overlap is 2–5.
- **Memory:** the rest of the application uses about 5.5 GB of limits, leaving about 6.5 GB for previews. A running preview uses roughly 250–400 MB and can reach its ~1.1 GB cap during `npm install`.
- **CPU is the real limit — for starting, not running.** An install can use a full core; the pre-built `node_modules` in the runner image removes most of that work for projects that stay close to the starter template.
- **When the pool is exhausted**, users see "Every preview runner is busy right now. Try again in a minute." Collaborators on one project share its preview, and idle previews stop after 10 minutes.

## Settings

| Setting | Value | Why |
|---|---|---|
| Warm pool size (`runner-pool` replicas) | 1 | The first start is still instant, and it saves memory |
| Maximum preview pods (namespace quota) | 7: 1 warm + 6 active | Previews can never starve the Java services |
| CPU priority | Java services above previews | The site stays responsive while previews start |
| `preview.boot-timeout` | 4 minutes | Slow installs on 2 cores don't fail |
| `preview.idle-timeout` | 10 minutes | Frees slots quickly |

Re-measure after any change to limits or the pool, and update this page with the numbers.
