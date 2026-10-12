# Capacity

How the 12 GB, 2-core machine is shared, and how many previews fit.

## Measured baseline

With the stack idle and one warm runner pod, `kubectl top` reports:

| | Usage |
|---|---|
| Node | about 3.3 GB of 12 GB (27%), 4% CPU |
| Java services | 231–489 Mi each (workspace 489, intelligence 438, account 376, gateway 245, discovery 231), against limits of 384–640 Mi |
| Postgres / MinIO | about 101 Mi / 109 Mi |
| Namespace quotas | `singularity` 4.0 of 8 Gi memory and 5.7 of 8 CPU limits; `singularity-ai` 1.5 of 12 Gi with one warm runner |

## Previews

- **Up to 6 previews can run at once**, and 1–2 can *start* at the same moment comfortably. For an audience of about 50 occasional users, realistic overlap is 2–5.
- **Memory:** the rest of the application uses about 5.5 GB of limits, leaving about 6.5 GB for previews. A running preview uses roughly 250–400 MB and can reach its ~1.1 GB cap during `npm install`.
- **CPU is the real limit — for starting, not running.** An install can use a full core; the pre-built `node_modules` in the runner image removes most of that work for projects that stay close to the starter template.
- **When the pool is exhausted**, a start waits in line and begins by itself when a runner comes free; the panel shows the person's place. A wait longer than `preview.queue-timeout` (5 minutes) ends with "Every preview runner stayed busy…". Collaborators on one project share its preview, and idle previews stop after 10 minutes, which is what frees a runner.

## Settings

| Setting | Value | Why |
|---|---|---|
| Warm pool size (`runner-pool` replicas) | 1 | The first start is still instant, and it saves memory |
| Maximum preview pods (namespace quota) | 7: 1 warm + 6 active | Previews can never starve the Java services |
| CPU priority | Java services above previews | The site stays responsive while previews start |
| `preview.boot-timeout` | 4 minutes | Slow installs on 2 cores don't fail |
| `preview.idle-timeout` | 10 minutes | Frees slots quickly |
| `preview.queue-timeout` | 5 minutes | Outlasts a burst; short enough that nobody waits out someone else's whole session |

## Measured start times

Measured by `PreviewPipelineIT` on the starter template ([how to run it](../practices/testing.md#the-preview-pipeline-test)), on a local kind cluster on a development laptop, 2026-10-08. A start is timed from the request to the dev server answering through the proxy.

| | Empty `node_modules` (`k8s/runner-pods.yml`) | Pre-installed `node_modules` (the seed, as in production) |
|---|---|---|
| First start, fresh pod | 30.1 s | **4.3 s** |
| Reinstall after a new package, same pod | 7.1 s | 6.1 s |
| Start that had to wait in line for a pod to be created and warm | 37.9 s | 14.2 s |
| Start that fails at install (a package that does not exist) | 19.2 s | 3.6 s |

Measured again on 2026-10-10, after the starter template gained the packages a project's server uses and the runner moved to Node 22 (same laptop, one run each): with the seed, 5.1 s, 6.3 s, 14.5 s and 3.7 s down that column (a first start was between 4.5 and 6.7 s over four runs that day), so nothing moved; without it a first start took 47.4 s, about 17 s more than before, which is the extra packages being downloaded. A project's own server was answering through the proxy 2.7 s after its files were saved, with no restart of the dev server, and checking a turn's server before saving it took 6 to 8 s.

And once more on 2026-10-10, after a start was changed to finish its dependency scan before the preview opens and to scan afresh every time (same laptop, one run): with the seed, 5.4 s, 7.1 s, 15.2 s and 4.1 s down that column. A start in which a build is saved midway also starts the dev server a second time, about two seconds more.

The seed is what makes a start a matter of seconds: it removes about 26 of the 30. A restart on a pod that already has its packages costs the same either way. The third row includes the pool creating a pod from nothing, which is about 10 seconds of it.

**Production, timed by hand on 2026-10-10** (stopwatch, from the press to the app appearing; the release before the runner moved to Node 22): a first start 44 s, a restart on the same pod 8 s, a first publish 48 s, an update of a published app 12 s. The restart and the update are in line with the laptop. The first start and the first publish are not: 44 s is slower than a laptop start with no seed at all, where a seeded start is about 5 s. The deployed manifests do carry the seed (the rendered `oracle` overlay has the `seed-node-modules` init container, and the image it names is in the registry), so the cause is not known yet. What would tell: the `$ npm install` lines in the output panel of a first start there - `added N packages` means the seed was not in the pod, `up to date` after many seconds means a slow first read of it, and a quick install means the time went on waiting for the pool's one pod to be made.

## Publishing

A publish claims one runner pod for the length of its build and releases it afterwards, so it competes with previews for the pool; a build that finds none waits up to `publishing.runner-wait` (90 seconds) and then fails as "try again in a moment". Measured by `PublishPipelineIT` ([how](../practices/testing.md#the-publish-pipeline-test)) on the starter template, on a local kind cluster with the pre-installed `node_modules`, 2026-10-08: **16.3 s** for a first publish and **16.1 s** for an update, from the request to the app being served through the proxy. That is claim, copy, `npm install` (nothing to install), `vite build`, collect, store and the pointer. Without the seed the install adds about the 26 seconds the preview start does.

**Production has not been measured.** Publish once there and time it with a stopwatch (the panel shows the steps but no clock); put the number here.

## A demo day

Several people starting at the same moment each need a warm pod; the pool keeps `replicas` of them and takes about 10–20 seconds to warm a replacement. With the default of 1, the second and third simultaneous starts wait in line for that long. For a demo, raise it for the day:

```bash
kubectl --context <prod> -n singularity-ai scale deployment/runner-pool --replicas=3
```

- **3** covers three people pressing Start together, which is a room's worth. It does not raise the ceiling: the namespace quota still caps warm and active pods together at 7, so with 3 warm there is room for 4 running before a start waits.
- A warm pod costs its requests (about 300 Mi and 0.12 CPU) and little real memory until claimed.
- **The next deploy sets it back to 1**, because the manifest says 1. Scale it again after a deploy that day, and back to 1 afterwards (or let the next deploy do it).

Re-measure after any change to limits or the pool, and update this page with the numbers.
