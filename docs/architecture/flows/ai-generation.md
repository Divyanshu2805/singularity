# Flow: AI Generation

The platform's core loop: a user asks for something in the project chat, and files actually get written. It runs in intelligence-service, which reaches workspace-service over the internal API for anything about the project.

The server owns a turn from the first word to the saved result. A browser only *watches* one: it can close, refresh or lose its connection and the turn carries on, and whatever the browser shows while the answer streams is replaced by the saved turn the moment the server says it is saved.

## Steps

All paths below are under `intelligence-service/src/main/java/com/singularity/intelligence/`.

1. **`controller/ChatController.streamChat`** — the SSE endpoint. It turns each `GenerationSignal` from the turn into a named event (see [the chat stream](../../api/streaming.md#chat-stream)) and adds the keep-alive heartbeat.
2. **`service/impl/AiGenerationServiceImpl.streamResponse`** — the way in. The `@PreAuthorize("@security.canEditProject(#projectId)")` gate sits here. On the request thread, before the response has started, it registers the turn (`GenerationRegistry` — a second turn for the same project is a `409`, whoever started the first) and reserves the daily token budget (`UsageService.reserveBudget` — a spent budget is a `402` carrying the quota). Either refusal is therefore a real HTTP status, not an event inside a stream. It then hands the turn to `BuildTurn` on a virtual thread (`config/GenerationConfig`) and returns the turn's viewer stream.
3. **`service/impl/BuildTurn`** — the turn itself: one blocking loop that describes the project, calls the model, reviews what came back, carries the reply on or repairs it if it has to, and hands the result to be saved. Everything below up to step 8 happens inside it.
4. **`llm/BuildModel`** — one call to the model: the system prompt, the conversation, the read tool and the project's shape. It is built inside `Flux.defer(...)` because Spring AI's advisor chain is single-use per subscription, and it never retries by itself — only the turn knows what a failed call had already written.
   - **`llm/PromptUtils.getSystemPrompt()`** defines the tag protocol the model writes in (`<approach>`, `<message>`, `<todo>`, `<file>` for a new file, `<edit>` for a change to an existing one, `<delete>` and `<ask>`), the voice its messages are written in, how much to build, and what to do with a request outside the stack. See [ADR 0004](../decisions/0004-tag-based-generation-protocol.md) and [what a reply looks like](#what-a-reply-looks-like).
   - **`llm/PromptUtils.replyShape()`** is a skeleton of a reply that `BuildTurn` puts under the user's request for the model only; the turn is stored, and replayed as history, with the person's own words.
   - **`llm/ProjectBrief`** is what the model is told about the project, as a second system message: the file tree, the content of its files, and a notice if the starter template failed to copy (`templateInitIssue`). It is built once per turn (`llm/advisors/FileTreeContextAdvisor.describe`) and goes with every call of that turn. See [showing the project](#showing-the-project).
   - **`llm/tools/CodeGenerationTools.readFiles`** is the one tool the model can call, for files the brief did not show — and it is only offered when there are any. When it runs, the server writes a `<tool>` block into the turn's text and announces "Reading N files" itself; the model is not asked to say so. A file the brief already showed is answered with a pointer, not its content.
5. **`service/impl/ActiveGeneration`** — the turn in progress: its text as it stands, the status line, and every attached viewer. Each chunk the model writes is appended here and fanned out. A viewer that attaches late is replayed the text so far and the current status.
6. **`llm/LlmResponseParser`** on top of **`llm/GenerationProtocol`** — reads the text into typed events (`THINKING`, `MESSAGE`, `TODO`, `FILE_EDIT`, `FILE_PATCH`, `FILE_DELETE`, `LEARN`, `TOOL_LOG`, `ASK`), applies the limits a turn is held to, tidies every path to its stored form (`llm/GeneratedPath`) and reports the block the text stopped inside of, if any. A checklist step is ticked by its `<todo path>` equalling a written `<file path>` or `<edit path>` after both are tidied. A `FILE_PATCH` is an `<edit>` as the model wrote it; **`llm/FileEdits`** applies it to the file it changes, so that everything after this point - the checks, the save - deals only in whole files (`FILE_EDIT`).
7. **`llm/TurnReview`**, **`llm/FileEdits`**, **`llm/SyntaxCheck`** and **`llm/ProjectImports`** — the review after each call, described under [in-turn recovery](#in-turn-recovery).
8. **`service/impl/TurnRecorder.record`** — saves the turn. It:
   - stores the user's message and the assistant's reply;
   - drops the turn's file changes unless it ended normally or merely unfinished — a stopped, failed or empty turn never writes a file;
   - rechecks that the user may still edit the project (the authoritative check, even if a stop request from a project delete never arrived);
   - builds one `PublishRevisionRequest` from the turn's `FILE_EDIT` / `FILE_DELETE` events and makes a single `publishRevision` call. Publishing is all-or-nothing: on a `FAILED` or `CONFLICT` response every file event is removed and the turn is saved with a message naming what did not save, so a failed write is never recorded as a success. Each edited file's `previousContent` (for the diff view) comes back on the same response;
   - saves the turn's events, opening with a `THOUGHT` event ("Worked for 39s") whose `metadata` is the turn's [outcome](../../api/streaming.md#outcomes), and closing with any notes the server added. They go in one batch, falling back to one-at-a-time saves if the batch fails, so one bad event doesn't lose an otherwise good conversation record.
9. Only then does the turn leave the registry and its viewers receive `done` with the outcome. A turn whose save throws ends its viewers' streams with an `error` event instead.

Token usage is settled per call to the model, against the hold on the daily allowance the turn took when it was admitted: the first call is charged as `BUILD`, each later one in the same turn as `BUILD_RETRY`, and a call that ended without a usage report — stopped, timed out, failed, cut off — is charged an estimate of what was sent and what it wrote. See [the daily allowance](#the-daily-allowance).

## What a reply looks like

A reply that builds something has one shape, and the chat is drawn from it:

| In the reply | In the chat |
|---|---|
| `<approach>` — two to six short lines: the decisions the model is making and why | "Thought process", shown as it arrives and folded away once the answer begins |
| One short `<message>` naming where it is starting | A sentence |
| One `<todo path>` per file, all before the first file | Not drawn while the turn is written. It names each file's line as it lands and its place ("3/12"), and becomes the build card once the turn is saved |
| Each `<file>` / `<edit>` / `<delete>` | One line as it arrives, in the order it happens: what the step is for, the file, its place in the plan. Once the turn is saved the lines fold to one per group ("4 files written") and the build card - every step with its file, where a lesson is opened - is placed last, under the closing words |
| A one-sentence `<message>` between groups of files, on a build of five files or more | A sentence between the lines, saying what is in place and what comes next |
| A short final `<message>` | What the person can now try in the preview |

A message may not restate the request, hold a plan or list files — the checklist is the only plan. The prompt also holds the build to what was asked: a brief's "Keep it simple" list is a list of things not to build, and the model is told to add no features of its own. Both rules exist because of what a first build looked like: the brief repeated back before and after, a Markdown plan duplicating the checklist, and sound effects and an export nobody had asked for.

The tag is `<approach>`, not `<think>`. `think` is in the grammar and read the same way, for models that write one unprompted, but the prompt never asks for it: see [pitfalls](../../practices/gotchas/ai-generation.md#a-tag-named-think-is-not-yours-to-ask-for).

## The stack, and requests outside it

Every project is a React + TypeScript app on Vite, created from one starter template (`workspace-service/src/main/resources/starter-templates/`), and the live preview can run nothing else. The prompt says what to do when a request does not fit:

| Request | What the model does |
|---|---|
| Another framework or language (Vue, Next.js, Python, a mobile app…) | Writes no files. Says the workspace builds React apps and asks, with `<ask>`, whether to build the same thing in React. |
| Something that needs a server (accounts, a shared database, payments, email, a secret API key) | Builds the complete front end with its data in the browser — `localStorage` behind one module shaped like the API a backend would offer — and says in its final message what is simulated. Never a secret in code. |
| Another npm package | Adds it to `package.json` in the same reply; the preview reinstalls. |

Supporting a second stack is a change to the preview runner, not to this pipeline — see [constraints](../../known-gaps/constraints-and-trade-offs.md#previews-are-single-stack).

## Asking instead of building, or midway

When a request is ambiguous in a way that changes what gets built, the model may end the turn with up to three `<ask options="A|B|C">` tags. The prompt keeps this rare: it must not ask about anything it can decide well itself, and never about a message that is already a compiled brief.

The questions are always the last thing in a reply, and may come at either of two points. **Before building:** a short message and the questions, with no files. **Midway:** when the fork only shows itself once the work is under way, the model builds the part that does not depend on the answer — complete, with every file it listed written — then says what is in place and asks. The files are published as usual and the turn ends `SAVED`; the user's answer starts the next turn.

The parser stores each question as an `ASK` event (suggested answers in `metadata`), a turn that asks is never treated as unfinished, and the question is replayed in the next turn's history so the user's answer has something to answer.

## Teaching mode

Teaching mode changes nothing about the build: the same prompt, the same turn, the same length. It belongs to a turn, not to the browser. The mode menu beside the send button (`hooks/use-teaching-mode.ts`) only decides how the *next* message is sent: `ChatRequest.teaching` travels with it, `TurnRecorder` stores it on the reply (`chat_messages.teaching`), and the saved turn carries it back. A reply built with the mode on shows a graduation-cap button beside each finished step, for good; a reply built without it never does, whatever the menu says later. A retry is sent the way the turn it retries was.

Pressing the button asks `POST /code/lesson/stream` for that step (`lib/lesson-store.ts`), naming only the id of the `FILE_EDIT` event the turn saved - which is why the button appears once the saved turn has arrived. The server finds that event in the caller's own conversation, refuses a turn that was not built in teaching mode, and writes the lesson from **what the step changed**: the difference between the file as the turn saved it and the version it replaced (`llm/ChangedLines`, from the event's `content` and `previousContent`), with a few lines of context and the new file's line numbers; a file the step created is sent whole. Around that it gives the model what the person asked for and the turn's steps with this one marked, and the prompt (`CodeInsightPrompts.lessonSystemPrompt`) asks for one story: an opening that starts from the request and the step before, one section per piece of the change in the order the idea needs - each headed with the lines it covers (`### L12-18 · Title`) and carrying on from the one before - and a closing `### What happens next`. The answer streams in under the step; `lib/lesson.ts` reads it, and each section shows its own lines beside a button that opens the editor at that range and marks it. The finished lesson is stored on the event (`chat_events.lesson`) and sent with the conversation from then on, so it is written and paid for once and is still there after a reload or on another device. Nothing is requested for a step nobody opens, and pointing at the button requests nothing.

It used to be a per-browser switch that offered a **How `File.tsx` works** row under every step of every turn and explained the whole file, from text the browser sent. A request for a theme toggle was answered with a tour of a five-hundred-line file.

Lessons saved by earlier versions - a `<what>` and `<why>` written before the file, or before that a `<summary>` and one `<part>` per quoted line - are still stored and still shown, folded under their step as **What this step does**; `frontend/src/lib/lesson.ts` reads both shapes.

## Prompt layout

Everything that changes between requests sits at the end of the system prompt (today's date is its last line), so the long, otherwise identical text can be served from the provider's prompt cache. The file tree is written one path per line. The conventions describe the project in front of the model: the prompt has one form per UI kit (`llm/UiKit`, read off the project's own files), each as constant as the other. New projects are shadcn/ui, with every component of the kit and its props named in the prompt so its files are never shown or read; projects made before that are daisyUI. `PromptUtilsTest` and `KitPromptMatchesTemplateTest` pin these.

## Showing the project

A model left to discover a project through its read tool explores it one file at a time. Each read is a round of the tool loop and each round resends the whole conversation: one real turn on a brand-new project read nine files in six rounds, hit the cap on reads, and answered in plain words. Asking in the prompt for one call did not stop it. So the files are shown instead (`llm/ProjectBrief`):

| Project | What the model is shown |
|---|---|
| Small — at most 50 source files and 80,000 characters in all | Every source file: code, styles, markup and configuration at the project's root or under `src/`, apart from the UI kit's own components. It is told it has what it needs, **and the call is made without the read tool**. |
| Larger | The entry points and configuration (`package.json`, `index.html`, `vite.config.*`, `tsconfig.json`, `src/main.*`, `src/App.*`, `src/index.css`, `src/App.css`), then as many other files as fit, the likeliest to matter first: a file the request names, one whose path holds a word of the request, one a recent turn touched, a page before a helper. Nothing is read to rank them. It is told to read anything else it needs to see or change — every such file in **one** `read_files` call — and is allowed three calls in all before further reads are refused. |

Images, other assets, the lock file and the UI kit's components under `src/components/ui/` are listed in the tree but never shown - the prompt describes the kit, and showing its eighteen files would cost every call some seven thousand tokens. A file is never shown in part: one over 24,000 characters is left to the tool, without costing the rest of the project its place.

The tool is withheld, not merely discouraged, because a model that was told it already had every file read anyway — one it had just been shown, then a type declaration — and each of those was a round.

The message that carries the files ends with a few lines restating the output format (`PromptUtils.closingReminder`), in a build turn so does every answer from the read tool, and the request itself is followed by a skeleton of a reply (`PromptUtils.replyShape`) — the files are a system message, so the request comes after them and is what the model actually reads last. The format is defined near the top of a long prompt and the files come after it; with a page of source as the last thing it had read, a real model answered like a chat assistant — Markdown headings and code fences, not one tag.

Showing the files matters for more than cost. A reply that is carried on, repaired or asked for again is a new call, sent without the earlier call's tool results — so anything the model had only read through its tool is gone. A second attempt once rewrote `src/index.css` from memory, dropped the line that loads daisyUI, and saved an app with no styling. With the brief, the files are in front of the model on every call of the turn. Beyond the budget the same guarantee is kept another way: a file the model reads through its tool is added to the brief for every later call of the turn (`ProjectBrief.withRead`).

The limits were 12,000 characters a file and 60,000 in all until twenty measured turns showed what that cost: a first build routinely writes a page longer than 12,000 characters, so every later change began with a tool round to fetch the one file left out, which roughly tripled the turn's input.

## In-turn recovery

After every call `BuildTurn` asks `TurnReview` whether the answer is finished. The model is never simply sent the same request twice when it has produced something: it is shown what it wrote and asked for the rest.

| What came back | What happens |
|---|---|
| A planned file was never written, steps were listed with no files, or the call did not end cleanly (cut off for length, gone silent, failed part-way) | **Continued**, up to `generation.max-continuations` (2) times. A half-written file at the end and any premature "all done" are cut from the text first — viewers get a `replace` event — and the model is told what it already wrote, what is still owed and which file was cut off. |
| Nothing in the protocol at all — empty, only plain words outside any tag, or only its own working-out | **Asked once more.** An empty reply is sent again as it was; a reply in plain words is shown back with a reminder of the format, and one that only thought is shown its thinking and asked for the answer, because the model runs at temperature zero and an identical request gets an identical answer. If the second reply is plain words too, they are kept as the answer. |
| The provider answered `429` before writing anything | **Waited for** and asked again, up to 3 times with a growing pause. |
| The provider refused the request (`401`, `402`, `403`) | **Failed at once.** Retrying a rejected key or an exhausted provider account only delays the message. |
| An `<edit>` whose lines are not in the file, or are there more than once (`llm/FileEdits`) | **Repaired** (below). None of that path's edits are applied; they are cut from the text - viewers get a `replace` event - along with the reply's closing words. If it still cannot be applied the file is left as it was, the turn ends `INCOMPLETE` and a note names the file. |
| A written file does not parse (`llm/SyntaxCheck`) | **Repaired** (below). One still broken afterwards is saved with a warning naming the file and line. |
| The written files import a file that will not exist or a package `package.json` does not list (`llm/ProjectImports`) | **Repaired** (below). An import still unresolved afterwards is saved with a warning rather than hidden. |
| The compiler, checking the files in the project's running preview, reports an error in one of them, or a package the turn adds is not in the npm registry (`service/CodeChecker`) | **Repaired** (below). An error still there afterwards is saved with a warning naming the file and line. |
| A reply whose only fault is a final `<message>` it never closed | Nothing — it has answered. The text is kept as its last message. |
| Steps and files written in tags, but the plan and the summary written as plain sentences around them | Nothing is asked again — the work is done. When the turn holds no `<message>` at all, the plain text before its first step and after its last is kept as its opening and closing message. Text between blocks stays out. |

Reading files and then answering in words is a complete answer; it is never treated as an abandoned edit.

Every wait has a limit — silence on the model's stream (`generation.idle-timeout`, 3 minutes), one call (`attempt-timeout`, 10 minutes), the whole turn (`turn-timeout`, 20 minutes) — and the registry entry is removed on every path out, including the ones that throw. A turn that still ends short of its plan is saved as `INCOMPLETE` with the files it did write and a note saying how far it got; the user's Retry then carries on from there, since the model sees those files in the tree.

**The repair.** Once a reply is otherwise finished, its edits are applied and the whole files that result are checked - parsed, and their imports resolved. Everything found goes back to the model in one request, up to `generation.max-repairs` (3) times, and each kind is shown rather than only named: a failed edit with the line of its copy that differed and the file printed as it stands (a repair is a new call, which has none of what the model read through its tool before); a syntax error with the numbered lines around it; an import with what it failed to resolve to. The read tool ends its answers in that call with a note for a reply being finished, because the ordinary one restates a whole reply's order and had a model start over.

The syntax check parses each written JavaScript or TypeScript file with the Babel parser - the one the preview's bundler uses - and `package.json` as JSON. The parser is JavaScript - the published `@babel/parser` package, a Maven dependency of the service (its WebJar) - run inside the service on GraalJS with no access to the host; the generated code is passed to it as a string and only ever parsed (see the [security model](../security-model.md)). If the engine cannot start the check is skipped and files are saved unchecked: it fails open.

Before a turn is handed over to be saved, a backslash the model left at the end of a line of code is taken out of its JavaScript and TypeScript files (`llm/StrayBackslashes`) - one known slip of a model rewriting a long file, and enough to stop a project compiling. The syntax check runs on the files as they will be saved, with those already out.

The import check is static and deliberately modest: relative and `@/` imports are resolved against the project's paths plus the files the turn wrote, and bare imports against `package.json`. Neither it nor the syntax check type-checks.

**The compiler.** Files that pass those static checks are handed to workspace-service (`service/CodeChecker`, `POST /internal/v1/projects/{id}/code-check`), which type-checks them where the project's packages are installed: in the project's running preview pod. `CodeCheckServiceImpl` copies the pod's own project into a scratch folder, writes the turn's files over the copy, links `node_modules`, and runs `tsc --noEmit`; the preview the person is looking at is not touched. A package the turn adds to `package.json` is looked up in the npm registry from the same pod. What comes back - a prop a component does not take, a name that does not exist, a package that cannot be installed - goes into the same repair request, with the numbered lines around each error, and the repaired files are checked again. Measured in a local kind pod it takes four to five seconds.

Only errors in the files the turn wrote are reported, so a project's older faults are not sent back on every turn, and "cannot find module" is dropped for a package the turn has only just added, since nothing has installed it yet. The check fails open at every step: with no preview running, a pod that is slow or gone, or no `tsconfig.json`, the turn is saved on the static checks alone.

Runtime failures - a fault that only shows when the app runs - are not caught before saving. The preview shows the error with one plain sentence on what went wrong and a **Fix this** button (`frontend/src/lib/preview-fix.ts`), which sends the error, its file and line and the top of its stack to the chat as the next message, asking for the smallest change that fixes it. The same error can be sent twice; after that the person is asked to describe what they were doing.

## The daily allowance

A plan allows a number of AI tokens a day. Three things are kept apart (`service/impl/UsageServiceImpl`, `service/impl/BudgetHolds`):

| | Where it lives | What it is |
|---|---|---|
| **Spent** | `usage_logs.tokens_used`, one row per user per day | What finished calls cost, as the provider reported it. Nothing else is ever added to it. |
| **Held** | In memory, one hold per call in progress | Room a running call has claimed so that no other call of the same user can claim it. Never shown. |
| **In flight** | In memory, on the hold | An estimate of what the call in progress has spent so far: the prompt, plus what it has written. |

The rule every admission and every growth of a hold keeps, under a per-user lock, is **spent + held ≤ the plan's limit**.

- **Admission.** A build is admitted when `usage.build-minimum-tokens` (10,000) are free and is granted up to `usage.build-reservation-tokens` (60,000) of what is free. The idea interview and the code lens need 1,500 and are granted up to 12,000. Less than the minimum free is a `402`.
- **While a call runs.** Every couple of hundred tokens `BuildTurn` reports the call's estimated spend. Past what the hold was granted, the hold grows into whatever is still free; when nothing is, the call is ended there.
- **When a call ends.** Its real cost is added to *spent* and its ledger row written, in a transaction that commits before the lock is released; the hold shrinks by that much and is topped up for the next call of the turn if there is room. If there is not room for another call, none is started - no continuation, second ask or import repair.
- **Out of allowance mid-turn.** The turn ends `OUT_OF_BUDGET`. The files it had finished are published - they were paid for - the half-written one is dropped, and a note says how many steps were saved and that Retry will carry on once the allowance refills.
- **What the meter shows.** `GET /api/usage/today` returns *spent + in flight*, capped at the limit, so the meter rises while a reply is written and moves only a little when the provider's count replaces the estimate. The browser re-reads it every few seconds while a reply streams.

Holds are in memory for the same reason a turn is: a call in progress belongs to this process. A hold written to a table would outlive a call that died with the process and keep that room out of reach for the rest of the day. A hold nobody closed is forgotten after an hour.

This replaced a reservation that was added to the day's counter as if it were spent - 60,000 tokens the moment a build began, corrected when its first call ended. That is why the meter used to jump at the start of every build and fall on the next refresh, why a build was refused with more than half the day's allowance showing as left, and - since nothing looked at the allowance again once a turn was admitted - why a long turn could finish past the limit.

## Conversation memory

A turn is told about the conversation before it by `llm/ConversationMemory`, within a fixed size (about 12,000 characters), so the thirtieth turn costs what the third does. The most recent six exchanges are replayed: a request as it was sent, shortened past 2,500 characters; a reply reduced to what it said, what it asked, and which files it touched. The exchange the project was started from is always kept, however long ago it was, with a note of how many requests since are not shown - the files are the record of what those did.

The last three replies, and the founding one, also carry the decisions the model made in them: the text of its own `<approach>`. That is what stops a later turn undoing an earlier choice - moving the data out of `localStorage`, swapping the palette - because nothing told it the choice was made on purpose. It belongs to one person's conversation and never crosses to another member's.

## Which model each call uses

Every call goes through `llm/ModelCalls`, which gives it the model and reasoning effort configured for its kind (`ai.calls.<kind>`; kinds in `enums/AiCallKind`: build, repair, interview, lesson, explain, suggest). A kind that sets nothing runs on the service's one model. Reasoning effort is most of the wait for a reply's first word; see [configuration](../../local-development/configuration.md#which-model-each-kind-of-call-uses).

## What the person sees first

The turn announces what it is doing from its first moment - "Reading your project", then "Thinking it through" - as `status` events, so a sent message is answered at once and not with a blank reply for the seconds a model takes to begin. Later lines say "Checking the code before saving" and "Saving your changes".

## Suggested next steps

After a turn that saved files, the browser asks `POST /api/chat/projects/{id}/suggestions` (`service/impl/SuggestionServiceImpl`) and shows up to three short requests under the reply; pressing one sends it. The call is a small one of its own (`llm/SuggestionPrompts`), given what was asked, what was said and file paths - never a file's content - and charged as `SUGGEST`. Anything that is not a clean result is an empty list.

## Stopping

`POST .../active/stop` cancels the model call in flight and lets the turn's own thread record what happened, so there is one writer for a turn's record. A stopped turn saves none of its files — half a feature is usually a broken project — but what it had said, including the message it was in the middle of, is saved with a note, as outcome `STOPPED`. A turn that has begun saving is past stopping: its files publish as one revision or not at all.

A project delete or a membership removal in workspace-service stops the affected turns the same way (`stopGenerationsForProject`).

## When the service restarts

A turn lives in memory until it is saved. On an orderly shutdown — every deploy — `service/impl/GenerationShutdown` runs in the first lifecycle phase to stop: it ends each turn in progress and waits up to 10 seconds for it to be recorded, as `FAILED` with a note that the server restarted and none of its files. It runs before the web server so viewers are still connected to be told, and before the database connections the save needs.

A process that is killed outright records nothing. The browser covers that case: when it can neither reattach to a turn nor find it saved, it keeps the question locally with the reason, so a reload brings it back with Retry (`frontend/src/lib/project-chat-store.ts`).

The registry also clears an entry that has sat for 45 minutes — longer than any turn can run — so a turn that somehow never finished cannot leave its project refusing every later request.

## In the browser

- **`frontend/src/lib/api.ts`** reads the stream and hands each event on by kind; it tells a stream that ended with an outcome from one that closed without one, one that broke part-way and one the server refused.
- **`frontend/src/lib/generation-protocol.ts`** is the browser's only reading of the answer's text, held to the server's by the shared cases.
- **`frontend/src/lib/project-chat-store.ts`** follows the turn: it shows files as they are written, adopts the saved turn on `done`, reattaches when a connection drops while the turn carries on, and never sends a request again by itself — only the Retry the person presses does that.
- **`frontend/src/components/ChatEventRenderer.tsx`** draws a turn from its events: the thought process (a step at a time, folded unless opened), the one build card with each step's files and its lesson button, and any question. **`frontend/src/lib/brief.ts`** decides how much of the person's own message is shown — the compiled brief appears as its "Build" sentence with the rest behind "Full brief".
- **`frontend/src/pages/ProjectView.tsx`** hands a step to the code lens when "Explain in detail" is pressed (`codeLens.explainStep`), and brings the preview up to date after a turn whose files were saved: a reinstall when `package.json` changed, a reload when the preview had reported an error (`previewFollowUp` in `frontend/src/lib/preview.ts`).
- **Sending a build request starts the preview** when the person may edit and none is running or starting (`shouldStartPreviewForBuild` in `frontend/src/lib/preview.ts`), never over a Stop they pressed. The compiler check needs a running preview, and the person would otherwise wait a second time for it after the build. A first build can still finish before a cold preview is up, and is then saved unchecked.
- **A stream that fails to open is checked before it is called a failure**: if the server has a turn running for that very request, the store joins it (`attachIfItStarted` in `frontend/src/lib/project-chat-store.ts`).

## Optional pre-publish validation

`RevisionBuildValidator` can type-check a revision in a disposable runner pod before it is applied. It is off by default (`revision-validation.enabled: false`). See [File revisions](../file-revisions.md#validation-before-publish).

## Related

- [Chat API](../../api/chat.md) and [streaming formats](../../api/streaming.md).
- [intelligence-service data model](../../schema/intelligence-service.md) — `CHAT_MESSAGE`, `CHAT_EVENT`, usage tables.
- [Security model](../security-model.md#ai-prompt-boundaries) — why code insight cannot write files.
