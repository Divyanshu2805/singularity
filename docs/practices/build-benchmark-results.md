# Build Benchmark Results

What the [build benchmark](testing.md#the-build-benchmark) measured, run by run. Each run is the same twenty requests: eight first builds, eight changes to the apps those builds left, two questions and two requests for another stack.

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
