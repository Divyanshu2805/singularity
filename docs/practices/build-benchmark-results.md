# Build Benchmark Results

What the [build benchmark](testing.md#the-build-benchmark) measured, run by run. Each run up to 2026-10-08 is the same twenty requests: eight first builds, eight changes to the apps those builds left, two questions and two requests for another stack. From 2026-10-10 there are twenty-three: a first build and two changes that need a server of the project's own were added. By 2026-10-16 there are twenty-four, with a change that removes a page.

All of it was measured on Google's models through the OpenAI-compatible endpoint, on one developer machine, with each project held in memory. **None of it says what production does**: production is configured for a different model on a different provider, which has not been measured.

Times are medians. "Right" means the turn ended the way its kind should and the server had nothing to add. "Compile" is `scripts/bench-verify.sh` on the projects the run wrote: do they install, type-check and bundle.

## 2026-10-08

| Run | Right | First word, first build | First build | Slowest build | First word, change | Change | Tokens out, first build | Compile |
|---|---|---|---|---|---|---|---|---|
| Baseline: `gemini-3.8-flash`, default reasoning | 20 / 20 | 9.1 s | 54.8 s | 110.2 s | 4.9 s | 21.3 s | 7,874 | not run |
| Same code, `reasoning-effort: low` for build and repair | 20 / 20 | 2.4 s | 42.5 s | 69.9 s | 2.1 s | 17.4 s | 6,679 | 16 / 16 |
| `gemini-3.5-flash-lite`, low | 19 / 20 | 1.3 s | 15.3 s | 34.6 s | 1.3 s | 7.0 s | 6,581 | not run |
| `gemini-pro-latest`, low | 20 / 20 | 9.4 s | 29.7 s | 43.9 s | 8.6 s | 15.0 s | 2,650 | not run |
| After this round's changes: `gemini-3.8-flash`, low | 20 / 20 | 2.7 s | 53.0 s | 61.9 s | 2.6 s | 11.2 s | 7,770 | 16 / 16 |

The targets the round was held to were a first word under 3 s, a first build under 60 s and a small change under 20 s. The last row meets all three at the median; the slowest first build is 61.9 s.

### What changed between the first row and the last

- **Reasoning effort.** Most of the wait for a first word was the model reasoning before it wrote, and the prompt already asks for the reasoning that matters in the open. This is a setting, not a default: `ai.calls.build.reasoning-effort=low` and `ai.calls.repair.reasoning-effort=low`.
- **The project brief's limits.** At 12,000 characters a file, every change to a built app began with a tool round to fetch the one page the brief had left out. At 24,000 that round is gone, which is most of the change from 21.3 s to 11.2 s.
- **Scope for a one-line request.** "a pomodoro timer" went from nine files and 110 s to seven files and 61 s; the prompt now says what a one-sentence request gets.
- **The starter template.** New projects are shadcn/ui, with the kit described in the prompt and its files never shown. Every first build of the last run used the kit's components and set the theme's tokens; four of the eight still wrote some fixed colour classes.

The last row is slower on first builds than the second because it does more: each build now also writes the app's theme.

### What the runs showed that is not fixed

- **A build can save code that does not compile.** In one run two of eight first builds did: an icon that does not exist in `lucide-react`, and `useEffect` imported from `react-router-dom`. Both pass the static checks, which resolve a package and not its members. The [compiler check](../architecture/flows/ai-generation.md#in-turn-recovery) catches exactly this and sends it back - but only when the project's preview is running, and the benchmark has none. The run after it compiled sixteen of sixteen with the same prompt bar one sentence, so treat one clean run as luck until the check runs on every build.
- **Run-to-run variation is large.** At temperature zero a one-sentence change to the prompt moved every first build by thousands of tokens. Eight first builds is a small sample; compare medians, and rerun before believing a difference of a few seconds.
- **The provider's prompt cache is not hit on the build model.** See [below](#the-providers-prompt-cache).
- **Cost is not in the table.** No prices were entered for these models. Pass `-Dbench.price.*` to add the column.

### Choosing a model from these

`gemini-3.8-flash` with low reasoning is the only row that is fast to its first word and right twenty times out of twenty. `gemini-3.5-flash-lite` is three times faster and got one change wrong; it suits the calls that write a few hundred words - the interview, lessons, explanations, suggestions. `gemini-pro-latest` writes the least code and the fewest files, but its first word takes nine seconds whatever effort is asked for.

### A project too large to show whole

Six real turns on a made-up back-office project of 74 source files and 137,000 characters, `gemini-3.8-flash` with low reasoning: five changes (one adding a page and its route and navigation link) and one question.

| | |
|---|---|
| Turns right | 6 of 6 |
| Files shown to the model | 48 or 49 of 74, about 86,000 characters |
| The file a request needed was among those shown | every time |
| Read rounds through the tool | none |
| Time | 3.7 s for the question, 5 to 9 s for a change |
| Tokens in | about 26,000 a turn |
| Project compiles after each change | 5 of 5 |

The files were chosen from the request's words alone, and every request here named what it was about. A request that does not - "make the tables easier to read" - is the case this did not test, and since no turn had to read a file, keeping read files for later calls was not exercised by a real turn either.

### The provider's prompt cache

The same 5,563-token build prompt, sent three times in a row to Google's own API, which reports what was cached:

| Model | Cached on the second and third call |
|---|---|
| `gemini-3.8-flash` | 0 tokens |
| `gemini-3.5-flash-lite` | 2,034 tokens |

So the model that builds does not serve the prompt from cache, however it is laid out; every build call pays for the whole prompt. Google's explicit cache (a stored prompt referred to by name) would change that and is not built.

### A rule that every screen fits its window (2026-10-08)

A kanban board built in the app came out as three fixed columns wider than the preview, so the page scrolled sideways. The Design section of the build prompt now ends with a rule no style overrides: phone layout first, side-by-side things stack or wrap on a narrow screen, no fixed width wider than a phone, and anything that truly needs the room scrolls in a box of its own. Four turns were run with it on `gemini-3.8-flash` at low reasoning, not the full twenty:

| Scenario | Outcome | Right | First word | Total | Calls | Out |
|---|---|---|---|---|---|---|
| todo-build | SAVED | yes | 5.8 s | 33.1 s | 1 | 4,505 |
| todo-dark-theme | SAVED | yes | 3.2 s | 9.6 s | 1 | 1,106 |
| kanban-build | SAVED | yes | 8.3 s | 42.0 s | 1 | 5,904 |
| kanban-clear-done | SAVED | yes | 2.1 s | 9.6 s | 1 | 1,323 |

The board now lays its columns out as `grid grid-cols-1 md:grid-cols-3` with no fixed widths. The prompt grew by about 190 tokens. It was not compiled with `scripts/bench-verify.sh`, and it was not looked at in a preview at phone width.

## 2026-10-10: a server of the project's own

The preview learned to run a small server out of a project's `server/` folder, and the build prompt gained a section saying when to build one and what it is made of ([ADR 0009](../architecture/decisions/0009-a-server-in-the-preview.md)). Three requests were added to the benchmark for it: a tic-tac-toe game "two friends play from their own screens", a rematch counter for that game, and a leaderboard "everyone who uses the app shares" for the flashcards app. `gemini-3.8-flash`, low reasoning, as before. The medians are over twenty-three requests, so they are not the same sum as the rows above.

| Run | Right | First word, first build | First build | Slowest build | First word, change | Change | Tokens out, first build | A server where one was needed | Compile, and servers start |
|---|---|---|---|---|---|---|---|---|---|
| The section alone | 23 / 23 | 3.0 s | 55.9 s | 87.2 s | 2.2 s | 16.8 s | 8,713 | 1 of 3, and that one kept its scores in memory | not run |
| The rule where the model reads last | 23 / 23 | 2.4 s | 48.4 s | 97.7 s | 2.1 s | 21.2 s | 8,864 | 3 of 3, each with its tables in SQLite | 17 / 19 |
| With the launcher, and a project's server files shown to the model | 23 / 23 | 2.5 s | 36.1 s | 61.0 s | 2.5 s | 17.0 s | 7,857 | 3 of 3 | 19 / 19, and 3 of 3 servers run as one program on a host's port |

None of the twenty older requests was given a server in either run.

### What the first run showed

"Right" was twenty-three of twenty-three, and two of the three new requests were wrong in a way no check sees. The game had no server: rooms in `localStorage` and moves over a `BroadcastChannel`, which reaches the maker's two tabs and no second person. The leaderboard had a server whose scores were an array in memory, with four invented players on the board and a `localStorage` copy for when the server did not answer. The section was read and the prompt's older habit won ([pitfalls](gotchas/ai-generation.md)). The skeleton under the request now asks first where the data lives and states the rule in one paragraph; the second row is that change.

### What the second run showed

- **A table that changes.** The rematch turn added two columns to a `CREATE TABLE IF NOT EXISTS`, which does nothing to a database that already holds the table. The benchmark starts every project from nothing, so it saw no fault; a running preview would have. The preview now starts a project's database again when `server/db.ts` changes, and the prompt says that is how a table is changed.
- **SQL nobody reads.** One of the two projects that did not pass `bench-verify.sh` is the game's first build: its `CREATE TABLE` says `PRIMARY ikey`, and the server stops on its first line. The parser and the compiler pass it, since it is a string. The turn's server is now started in the preview pod before the turn is saved, and one that cannot start goes back to the model; the benchmark runs with no preview, so it does not exercise that, and `bench-verify.sh` now starts every server it finds.
- **The other project that did not pass** is `todo-due-dates`, an ordinary change with a name used where it does not exist (`task` for `tasks`). It is the kind of fault the type-check in a running preview exists for; the two earlier runs that were compiled were sixteen of sixteen.

### What the third run was for

A project is meant to be hosted by its owner, and a host runs one program on a port it picks. The prompt was first given two more things to ask of the model's server: read the port from `PORT`, and serve the built pages with four lines shown in the skeleton. A run of the five server-related requests came back with three servers, all three with `const port = 3001` and none with the four lines; `bench-verify.sh`, which by then started each server the way a host would, failed all three.

So the model is not asked. The starter template carries a launcher, `start.mjs`, that serves the pages, starts the project's server on 3001 and passes `/api` on to it; the two instructions came out of the prompt again. The same three projects, with nothing changed but that file beside them, passed. The third row is the whole benchmark with it: nineteen of nineteen projects compile, and each of the three with a server answers a request for its page and a request under `/api` on the port it was given.

Two other things moved in that row. A project's `server/` files are now shown to the model like its pages - they had been left out by a rule that said `src/`, and the rematch turn had been rewriting both server files whole for want of seeing them. And the one ordinary project that did not type-check in the second run did in this one; that is one run each, not a finding.

### Not measured

- Whether the two-player game is playable by two people. Its server starts and its routes exist; nobody has played it. That is a row of the [preview checklist](../local-development/preview-checklist.md).
- The in-turn server check on a real model's turn. It is proven on kind with a server written for the test (`PreviewPipelineIT`), not with the turn above that would have needed it.
- Cost, as before: no prices were entered.

## 2026-10-16: the repair loop switched off

Is the repair loop - the edit, syntax and import checks that send a turn's problems back to the model before it is saved - what keeps the generated projects compiling? The whole benchmark was run twice, back to back, on the same code: once with `generation.max-repairs=0`, so nothing found is ever sent back, and once with the default of 3. Each run's projects were then compiled with `scripts/bench-verify.sh`. `gemini-3.8-flash`, low reasoning, as before; the benchmark now holds twenty-four requests (`todo-remove-page` is the one added since the last section). The prices were entered this time: $0.75 in and $3.75 out per million tokens.

| Run | Right | First word, first build | First build | Slowest build | First word, change | Change | Tokens out, first build | Cost per turn | Compile, and servers start |
|---|---|---|---|---|---|---|---|---|---|
| Repairs off | 24 / 24 | 2.3 s | 54.0 s | 74.8 s | 2.3 s | 12.4 s | 8,921 | 2.4 cents | 20 / 20, and 3 of 3 servers |
| Repairs on (the default) | 24 / 24 | 2.9 s | 63.6 s | 111.8 s | 2.6 s | 12.8 s | 8,214 | 2.4 cents | 20 / 20, and 3 of 3 servers |

The two runs cost $1.16 together.

### What it showed

- **The repair loop was never needed.** In neither run did a turn leave an edit that could not be applied, a file that does not parse or an import that does not resolve: the log has no repair at all, so switching repairs off changed nothing that was saved. The two turns of the second run that made two calls (`expenses-build`, `pomodoro-build`) were continuations of a reply that stopped early, not repairs, and they are most of why that run's first builds are slower.
- **So this does not measure what the loop is worth.** It says the model, on these twenty-four requests and this prompt, now writes code those checks have nothing to say about - forty of forty projects compiled across the two runs. The faults the loop was built for are on record ([pitfalls](gotchas/ai-generation.md)) and came from longer turns, older prompts and whole-file rewrites; a benchmark that showed the loop working would need requests that provoke them.
- **The compiler check was not exercised either.** The benchmark has no running preview, so the type-check in the preview pod never runs here; what compiled was checked afterwards by `bench-verify.sh`.
