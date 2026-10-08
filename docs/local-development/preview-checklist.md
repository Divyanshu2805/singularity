# The Preview Checklist

Every preview case, how to provoke it, what should happen, and where it was last verified. Go down it after any change to the preview pipeline or the Preview tab, and before a demo.

Two kinds of row:

- **Automated** — `PreviewPipelineIT` proves it on a real kind cluster ([how to run it](../practices/testing.md#the-preview-pipeline-test)). It covers the server and the proxy. It does not open a browser, so the "in the tab" column of those rows is still yours to look at once.
- **By hand** — needs a browser, two people, or a long wait. Record pass or fail and the date in the last column.

## Starting and stopping

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 1 | First start | Open a project, switch to Preview, press Start | The checklist ticks through four steps; the app appears; the toolbar shows the address and "Up to date" | Server and proxy: automated, kind, 2026-10-08. In the tab: |
| 2 | Restart | Press **Reinstall and restart** (editors and owners only) | Back to "Installing dependencies", same address, the app returns | In the tab: |
| 3 | Stop | Press Stop | "The preview isn't running" with Start; the pod and the route are gone | Server and proxy: automated, kind, 2026-10-08. In the tab: |
| 4 | Idle stop, and coming back by itself | Leave the browser tab hidden for more than `preview.idle-timeout` (10 minutes), then return | It was stopped "after 10 minutes without a visit" and starts again by itself as the tab shows; nothing to press | By hand: |
| 5 | A viewer | Open the project as a member with the viewer role | Start and Stop are there; **Reinstall and restart is not**; calling the restart endpoint directly answers `403` | The rule: unit-tested (`PreviewAuthorizationTest`). In the tab: |

## Keeping up

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 6 | An edit | With the preview running, ask the chat for a small visible change | "Updating" beside the address, then "Up to date"; the page changes without a reload and keeps its state | Server and proxy: automated, kind, 2026-10-08. In the tab: |
| 7 | A new package | Ask for something that needs a package the project does not have (a date picker, a chart) | The panel goes back to "Installing dependencies" by itself, on the same address, and the app returns using the package. Nobody presses anything, in this tab or a collaborator's | Server: automated, kind, 2026-10-08 (7 s on the same pod). In the tab: |
| 8 | Two collaborators, one runner | Two people open the same project's preview | The second joins instantly with no second install; both see the same edits arrive | By hand: |
| 9 | One collaborator leaves | One of the two presses Stop | Theirs says stopped; the other's keeps running. The runner stops only when the last one leaves | By hand: |

## When something is wrong with the project

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 10 | A package that does not exist | Add `"no-such-package-xyz": "1.0.0"` to `package.json` and start | "The project's packages couldn't be installed", the sentence names the package, npm's output is under it. No automatic retry | Server: automated, kind, 2026-10-08. In the tab: |
| 11 | Code that does not compile | Break a bracket in `src/App.tsx` | The preview stays up; "The preview hit an error" appears with one plain sentence, **Fix this**, and **View output**. Fixing the file takes the error down by itself | Server and proxy: automated, kind, 2026-10-08. In the tab: |
| 12 | An error while running | Make a button's handler throw | The same alert, with the file and line; the Console tab of the output panel shows the error | In the tab: |
| 13 | A blank page | Make `App` return `null` | "The page is blank" with **Fix this** and **View output**; it goes away when the app draws something | Detection: unit-tested (`proxy/reporter.test.js`). In the tab: |
| 14 | A dev server that will not start | Put a syntax error in `vite.config.js` and start | "The app's dev server couldn't start — vite.config.js has an error…", with Vite's output | The sentence: unit-tested (`PreviewFailureExplainerTest`). In the tab: |

## When something is wrong with the platform

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 15 | Every runner busy | `kubectl -n singularity-ai scale deployment/runner-pool --replicas=0`, wait for the idle pods to go, then start a preview; then scale back to 2 | "Every runner is busy right now. You're next in line." It starts by itself within seconds of a pod appearing | Server: automated, kind, 2026-10-08. In the tab: |
| 16 | The runner pod killed | `kubectl -n singularity-ai delete pod <the busy runner> --grace-period=0` | The frame is covered ("The preview is restarting"), then the preview starts again by itself on a fresh pod. Nobody presses anything | Server and proxy: automated, kind, 2026-10-08 (noticed on the next request). In the tab, including the automatic restart: |
| 17 | The service restarting mid-start | Start a preview and restart workspace-service while the checklist is on "Installing dependencies" | When the service is back the start is failed as interrupted, and the panel tries again by itself; it goes on saying "Starting your preview" throughout | By hand: |
| 18 | Redis or storage down for a moment | `kubectl -n singularity-ai rollout restart deployment/redis-server` during a start | The start survives it, or is retried by itself; no error with a button | By hand: |

## Access

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 19 | A link that has run out, or was forged | Open a preview URL whose `pvt` token is older than 6 hours, or altered | "This preview link isn't valid" | Proxy: automated, kind, 2026-10-08 |
| 20 | The link running out under an open tab | Lower `preview.access-token-ttl` to `1m` locally, start a preview, wait two minutes, click something in the app | The frame is covered for a moment ("Refreshing the preview link") and comes back by itself | By hand: |
| 21 | A removed member's open tab | Remove a member who has the preview open | Their tab's next poll is refused; the frame keeps working only until their link runs out (at most `preview.access-token-ttl`, 6 hours). This is an expiry bound, not instant revocation — see [access boundary](../architecture/flows/live-preview.md#access-boundary) | By hand: |

## Comforts

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 22 | Tablet and phone width | Press the width button | It cycles full width → tablet (820 px) → phone (390 px) → full width | In the tab: |
| 23 | Back, forward and the address | In an app with two pages, click to the second; press Back, then Forward; type `/` into the address and press Enter | Each moves the page inside the frame only. Back is grey on the first page | In the tab: |
| 24 | The app's console | Add a `console.log` to the app; open the output panel's Console tab | The line is there; errors are red and counted on the tab | In the tab: |

## Timings

Measured by `PreviewPipelineIT`; the current numbers and how to re-measure are in [capacity](../deployment/capacity.md#measured-start-times). Production's own are measured by hand, with a stopwatch, from pressing the button to the app appearing: one first start of a fresh project, and one restart.
