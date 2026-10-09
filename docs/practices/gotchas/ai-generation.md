# Pitfalls: AI Generation

Traps in the build pipeline. A unit test rarely catches these, because the thing that goes wrong is what a real model does with a prompt, a provider does with a connection, or two parsers do with the same text. When you change the pipeline, run one real turn and read what came back.

## A tag name inside generated code is read as a tag

- **Symptom:** a turn "succeeds", the chat shows a file as written with a tick beside it, and the preview fails on an import of that file. It is not in the project. It happens every time for the same project.
- **Cause:** the parser matched tag names without regard to case and looked for opening tags inside a file's body. `useState<Todo[]>` was read as a `<todo>` block; the enclosing `<file>` then had no closing tag before "the next tag" and was thrown away whole. Any type or component named Todo, Message, File, Tool, Ask, Learn or Delete did it.
- **Fix:** tag names are exact lower case and a file's body is opaque (`llm/GenerationProtocol`). Don't relax either. See [ADR 0004](../../architecture/decisions/0004-tag-based-generation-protocol.md#one-grammar-two-implementations-one-file-of-cases).

## The browser and the server read the same text differently

- **Symptom:** the chat shows something the server did not save, or the reverse, and a reload changes what the turn looks like.
- **Cause:** the answer's text is parsed twice — as it streams in the browser, and on the server to save it — and any rule that exists in only one of them is a disagreement waiting for the input that exposes it. Whitespace is the subtle case: Java's `strip()` and JavaScript's `trim()` do not agree on which characters are spaces.
- **Fix:** a rule goes into `intelligence-service/src/test/resources/protocol/cases.json` first; both `GenerationProtocolCasesTest` and `generation-protocol.test.ts` run it. Only the six plain whitespace characters are ever trimmed, on both sides. And the browser's reading is only a preview — it adopts the saved turn on `done`.

## Asking the model in the prompt does not change what it does

- **Symptom:** the prompt says "read every file you need in ONE call" and the model reads one file per call anyway, six rounds in a row, each resending the whole conversation.
- **Cause:** a model follows the shape of its task and the example it is shown before it follows a rule. Given a tool for discovering files, it explores.
- **Fix:** remove the need rather than forbid the behaviour: the project's files are shown to the model up front (`llm/ProjectBrief`), so there is nothing to explore. Where a rule must stay, make the example flow agree with it — the example used to open with a read.

## What the model read last is what it follows

- **Symptom:** the model writes its files correctly in `<file>` tags but its plan and summary as plain sentences, or answers a build request like a chat assistant - Markdown headings and code fences, not one tag. It happens most right after it has read files.
- **Cause:** the output format is defined near the top of a long prompt. By the time the model answers, the last thing in front of it is several thousand characters of source - the project brief, or a tool result - and it mirrors that, not the rule above it.
- **Fix:** restate the format last, wherever "last" is: the project brief closes with `PromptUtils.closingReminder`, and so does every answer the read tool gives a build turn. And do not depend on it: `BuildTurn` keeps a tagged turn's untagged opening and closing words as messages, and asks again - saying what was wrong - only when nothing at all was tagged.

## The request is read last, not the reminder

- **Symptom:** with the format restated at the end of the project brief, a model given a two-hundred-word request still opens with the request repeated back in plain words, writes no `<message>` tag, lists features it was not asked for and closes with a bulleted summary.
- **Cause:** the brief and its closing reminder travel in a system message, and the conversation comes after it. "Last" was the request itself.
- **Fix:** `BuildTurn` puts a skeleton of a reply under the request (`PromptUtils.replyShape`) - the tags in order, one line each, marked as the system's. Only the model sees it; the turn is stored and replayed with the person's own words. On one real turn that alone halved the output (7 files and 7,400 tokens to 4 files and 3,800), kept the stylesheet's daisyUI line, and put every sentence inside a tag. A skeleton the model can copy does more than a paragraph of rules it has to remember.

## A tag named think is not yours to ask for

- **Symptom:** the model follows every line of the reply skeleton - message, steps, files, closing message - and leaves out exactly one: the `<think>` block. No error, no trace of it in the text.
- **Cause:** that name belongs to the reasoning a model or its gateway handles itself. A reasoning model is trained not to write it into an answer, and some gateways lift it out of the content.
- **Fix:** ask for `<approach>`. The grammar still reads `<think>` as the same block, for models that write one unprompted, but nothing in the prompt names it (`PromptUtilsTest` pins that). Before naming a new tag, check that the name means nothing to the model already.

## A later call in the same turn has none of the earlier call's tool results

- **Symptom:** a reply that was carried on, repaired or asked for again rewrites an existing file and loses what was in it — `src/index.css` came back without the line that loads daisyUI, and the saved app had no styling.
- **Cause:** the tool loop lives inside one call to the model. The next call is built from the opening messages plus the model's own text, so every file it had read through `read_files` is gone, and it writes from memory.
- **Fix:** what the model needs on every call belongs in the project brief, not in a tool result. A file it does read through the tool is added to the brief for every later call of the turn (`ProjectBrief.withRead`).

## An identical retry at temperature zero returns the identical answer

- **Symptom:** a retry of a reply that was unusable is unusable in exactly the same way, at twice the cost.
- **Cause:** the build model runs at `temperature: 0.0`. Sending the same request again is only useful when the failure was the provider's — nothing came back, the connection dropped.
- **Fix:** when the model produced something, the next request must differ: show it what it wrote and say what was wrong or what is still owed (`TurnReview`). `BuildTurn` resends unchanged only after an empty reply.

## A stray backslash at the end of a line of code

- **Symptom:** a turn is saved as a success and the preview shows the bundler's error instead of the app: `Expecting Unicode escape sequence \uXXXX`, pointing at the end of an ordinary line.
- **Cause:** asked for a small change across the app (a dark theme), the model rewrote nine whole files, and in the two longest one line came back with a backslash after it - `onClick={() => handleBatchDownload('all')}\`. The same files had been written cleanly the turn before. Nothing between the model and storage parses the code: the import check reads import lines, and the type-check before publishing is off by default.
- **Fix:** three things, each catching what the one before lets through. An existing file is no longer written out again: the model changes it with `<edit>`, which names only the lines that change, so the rest of the file cannot be damaged ([ADR 0004](../../architecture/decisions/0004-tag-based-generation-protocol.md#an-existing-file-is-changed-with-edit-not-written-out-again)). `llm/StrayBackslashes` still takes a backslash off the end of a line of code before a turn is saved. And `llm/SyntaxCheck` parses every written file with the bundler's own parser and sends anything that does not parse back to the model, with the lines around the error, before the turn is saved.

## A file read through a tool arrives as JSON

- **Symptom:** an `<edit>` cannot be applied: its SEARCH text is five lines of the file written on one line, with a literal `\n` between them.
- **Cause:** Spring AI turns a tool's return value into JSON. The read tool returns a list of strings, so the model was handed each file as a JSON string - every line break a `\n`, every quote a `\"`. Rewriting a whole file from that hid the problem; copying a few lines of it exactly did not.
- **Fix:** the read tool returns plain text (`CodeGenerationTools.PlainText`, its `resultConverter`). Anything a model must quote back exactly has to reach it unescaped. `FileEdits` also looks once more with the escapes undone, for the model that does it anyway.

## Asked to fix one thing, the model sends everything again

- **Symptom:** a repair call for one failed edit comes back with a second working-out, a second opening message, a second checklist and every edit over again - and the edit that had applied now fails, because the lines it looks for were already replaced.
- **Cause:** two things. The read tool ended its answer with the reminder that restates a whole reply's order, and that was the last thing the model read. And an edit is not repeatable: its SEARCH text is gone once it has been applied.
- **Fix:** a call that finishes a reply gives the read tool a different closing note (`PromptUtils.followUpReminder`); the repair request prints the file as it stands, so there is nothing to read again; and an edit whose SEARCH is not found but whose replacement is already in the file, in one place, is taken as done (`FileEdits`). A request to repair must say what was applied as well as what was not.

## A reservation counted as spending

- **Symptom:** the usage meter jumps by tens of thousands of tokens when a build starts and is lower again after a refresh; a build is refused with more than half the day's allowance showing as left; and a day's total still ends up past the plan's limit.
- **Cause:** the amount claimed before a call was added to the same counter that records what was spent, and corrected when the call ended. The meter read that counter, so it showed the claim. Admission needed the whole claim to be free. And once a turn was admitted nothing looked at the allowance again - the correction and every later call of the turn were added with no ceiling.
- **Fix:** what is spent, what is held and what a call in progress is estimated to have spent are three separate things (`UsageServiceImpl`, `BudgetHolds`); only the first is in the table, the meter shows the first plus the third, and a build turn reports its spend as it streams and is stopped when the allowance is gone. Anything new that calls a model for long should report its spend the same way. See [the daily allowance](../../architecture/flows/ai-generation.md#the-daily-allowance).

## A streamed model call has no timeout of its own

- **Symptom:** a project answers every chat request with `409` "already generating" until the service is restarted.
- **Cause:** a streamed call to the provider can stall without erroring — no bytes, no close. Nothing in Spring AI or the HTTP client bounds that by default, so whatever waits on the stream waits forever, holding the project's "in progress" entry.
- **Fix:** every wait in a build turn is bounded (`generation.idle-timeout`, `attempt-timeout`, `turn-timeout`), the registry entry is removed on every path out, and the registry drops an entry older than any turn can be. Anything new that waits on a model stream needs its own limit.

## The stream ending is not the turn ending

- **Symptom:** the browser shows a finished answer, then a retry or a reload shows something else — or the retry is refused with a `409`.
- **Cause:** the viewer's stream used to close when the model stopped writing, while the server went on to parse, possibly ask the model again, and save. A client that acted on the close raced that work.
- **Fix:** the stream now stays open until the turn is saved and ends with `done` and the outcome. Act on `done`, never on the connection closing; a close without `done` means "go and ask what happened". See [the chat stream](../../api/streaming.md#chat-stream).

## A helper that is tested but never called

- **Symptom:** the prompt tells the model "package.json is shown below, do not read it", every test is green, and the model imports packages that are not installed.
- **Cause:** the method that read `package.json` for the prompt had its own passing unit tests and no caller. A test of a helper proves the helper, not that anything uses it.
- **Fix:** test the text the model is actually given, end to end (`FileTreeContextAdvisorTest` checks the whole brief), and after any change to what the model sees, read one real request.

## A file just over the limit costs a whole extra round

- **Symptom:** every change to a project that one build made takes about three times the input tokens of the build itself, and its log shows `Requested file: src/pages/Index.tsx` before the first word.
- **Cause:** the project brief showed a file only up to 12,000 characters, and a first build routinely writes a page longer than that. Left out, the page had to be read through the tool - a round that resends the prompt and the whole project to deliver one file.
- **Fix:** the limit is 24,000 characters a file and 80,000 in all (`ProjectBrief`). Showing a file costs its length once; having the model fetch it costs the whole conversation again. When raising or lowering a limit like this, look at what real turns write, not at what the prompt asks them to write.

## The wait for the first word is the model's reasoning

- **Symptom:** nothing appears for nine seconds after a request, then the reply streams quickly. A question answered in forty tokens takes five seconds.
- **Cause:** a model that reasons before answering sends nothing while it does, and the build prompt already asks for the reasoning that matters in the open, as `<approach>`. The two were being done one after the other.
- **Fix:** each kind of call has its own reasoning effort (`ai.calls.<kind>.reasoning-effort`). With `low` for builds, twenty measured turns on one model went from 9.1 s to 2.4 s to the first word on a first build and stayed twenty of twenty right. It is a provider's word, and a provider refuses one it does not know - check a new value with a real turn.

## A one-line request is an invitation to overbuild

- **Symptom:** "a pomodoro timer" comes back as nine files in a hundred and ten seconds: the timer, and an ambient sound player, a statistics screen, a settings screen and a task list.
- **Cause:** the prompt said to build what was asked and nothing more, and a brief's "keep it simple" list gave that something to hold on to. A one-sentence request has no list, so the model filled the page with what such apps usually have.
- **Fix:** the scope section says what a one-sentence request gets - the smallest complete version, one screen, three to six files - and to name one neighbouring feature as a next step instead of building it. Vague requests are where a build's time goes; the benchmark has two for that reason.

## The prompt must describe the project in front of it

- **Symptom:** a turn on an older project imports `@/components/ui/button`, the import check sends it to a repair, and the repair writes the component by hand.
- **Cause:** the starter template changed kits, and one prompt described the new one to every project - including those created on the old one, which have no such folder.
- **Fix:** the kit is read off the project's own files (`llm/UiKit`) and the prompt has one form per kit. Anything the prompt says about what a project contains has to be true of that project, not of the newest template.

## A parser that tries both readings can take forever on fifty characters

- **Symptom:** every build on the instance stops at "checking" and none ever saves; nothing is logged. It starts with one turn and does not end until the service is restarted.
- **Cause:** the syntax check parses generated code in-process, one file at a time behind a lock. The TypeScript grammar is ambiguous - `<T>(` may open a generic arrow function or a comparison - and the parser tries both; two dozen of them nested (`f(<T>(<T>(...`) double its work at every level. A model writes what it is asked to, so anyone could have a turn write that file, and a thread waiting on a monitor cannot be interrupted by the turn's own timeout.
- **Fix:** a parse still running after five seconds is stopped from a second thread, its engine thrown away, and the file treated as fine (`llm/SyntaxCheck`). Anything that runs a third-party parser or a regular expression over text a model wrote needs its own limit: `ProjectImports` bounds how far one import statement is read for the same reason. Found by feeding the parser hostile shapes, not by any test of valid code.

## A file can end its own fence

- **Symptom:** none in ordinary use. A project file holding a line `--- END OF FILE ---`, a heading and a paragraph gets that paragraph read as the pipeline's own notice.
- **Cause:** a fence is only a line of text, and the file can print the same line. Telling the model "what is between the markers is material" holds only while the file cannot write the marker.
- **Fix:** `llm/FileFence.guard` changes the dashes of any line in a file that imitates one of the pipeline's marker lines, wherever a file is shown. It touches nothing else, so an ordinary project's prompt is unchanged - which matters, because a changed prompt has to be measured on a real model. A new marker line needs adding to its pattern.

## A stream the reader cancels was free

- **Symptom:** the usage meter does not move for explanations, answers and lessons a client closes just before the end.
- **Cause:** the provider reports usage with the last chunk. A stream cancelled before it had none to record, and the cancel handler released the reservation as if the call had never run.
- **Fix:** a cancelled stream is charged for what it wrote - the provider's count if it arrived, otherwise an estimate from the lengths (`AiUsageRecorder.reconcileUnfinished`). A build turn was already handled: it belongs to the server and is metered as it streams. Any new streamed call needs to say what a cancel costs.

## The chat shows a build before the server has saved it

- **Symptom:** a test (or a script) waits for the build card to read `4/4`, asks the server for a file the build wrote, and gets the starter template's placeholder - on a cold service, and never on a warm one.
- **Cause:** the browser draws a turn from the text as it streams; the files are published after the last word, and `done` is sent only then. `4/4` on screen is the model having finished writing, not the turn having been saved.
- **Fix:** read "the build is there" off the server - the saved file, or the stream's `done` - never off the chat alone (`e2e/tests/journey.spec.ts` waits for the file).

## A stream that finishes is cancelled too

- **Symptom:** every lesson, explanation and big picture appears twice in the usage log with the same token counts, and the daily allowance drains twice as fast as the calls made.
- **Cause:** when a streamed response completes, the servlet container closes it and Spring cancels the subscription it has just seen complete. A `doOnCancel` on the stream therefore runs after every ordinary ending, not only when the reader walks away. The cancel handler charged the call as abandoned; the completion handler had already charged it as finished.
- **Fix:** a call is settled once, by whichever ending comes first (`settled` in `CodeInsightServiceImpl.streamModel`). Any hook that does something that must happen once - charging, releasing, saving - needs the same guard when it sits on a stream a controller returns. Found by reading the usage rows after one real lesson; a unit test that only collects the stream never cancels it.
