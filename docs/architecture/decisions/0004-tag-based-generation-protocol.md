# 0004. A tag-based protocol for AI output

**Status:** Accepted (amended — see [Amendments](#amendments))

## Context

A generation turn produces a mix of things: a plan, messages to the user, whole-file edits, deletions, tool calls, and — in older conversations — explanations. The user should see it happen live, with a checklist that ticks off as each file is written. A single structured-output JSON document can't be rendered meaningfully until it is complete, and one malformed field can invalidate the whole response.

## Decision

The system prompt (`llm/PromptUtils.java`) defines a small XML-like tag protocol — `<message>`, `<todo path="…">`, `<file path="…">`, `<edit path="…">`, `<delete>`, and `<learn>` in teaching mode. The raw text is streamed to the browser as it arrives and parsed incrementally there. The server parses the same text into typed `ChatEvent` rows (`LlmResponseParser`) and publishes the file changes as one revision.

A checklist item is ticked off when a `<file>` or `<edit>` appears whose `path` matches a `<todo>`'s `path`.

The protocol later gained `<ask options="A|B|C">`, a question for the user in place of files. It fits the same shape as the other tags, so it needed no change to how a turn is streamed or stored: one more tag name in the two parsers and one more event type.

## Consequences

- Output renders progressively, and one bad block doesn't discard the rest of a turn.
- The client and server must agree on the protocol; changes to it touch both parsers.
- Recovery is possible within a turn, because the server can see what a reply planned and what it wrote.
- The read-only code-insight prompts deliberately never mention this protocol, so that path cannot write files. See [AI prompt boundaries](../security-model.md#ai-prompt-boundaries).

## Amendments

### One grammar, two implementations, one file of cases

"The client and server must agree" was left to care, and they did not agree. The server matched tag names without regard to case and searched a file's body for opening tags, so `useState<Todo[]>` inside a file was read as the start of a `<todo>` block; the file then had no closing tag before "the next tag" and was discarded whole. The browser had four separate, more lenient readings of the same text and showed the file as written, with a tick beside it. A generated todo app lost its hook file on every attempt, and any project with a type or component named Todo, Message, File, Tool, Ask, Learn or Delete was exposed to the same.

The grammar is now written down once, in `llm/GenerationProtocol.java`:

- A tag name is exactly `message`, `file`, `delete`, `tool`, `todo`, `learn`, `ask`, `approach` or `think`, **in lower case**, followed by nothing but well-formed `name="value"` attributes. A `file` or `delete` is a tag only when it carries a non-blank `path`.
- **A file's body is opaque.** Nothing inside it is read as a tag. It ends at the first `</file>` that is either the last one before the next `<file path=…>` opens, or is followed by another opening tag before the next `</file>`.
- Every other block ends at its last closing tag before the next opening tag.
- A block that never closes is not a block. If nothing could still close it, it is reported as the block the text stopped inside of.
- "Blank" and "trimmed" mean the six plain whitespace characters and no others. Java and JavaScript each have a wider idea of whitespace and the two differ, so neither is used; a path holding any other kind of space is refused.

It is implemented twice — `GenerationProtocol` + `LlmResponseParser` on the server, `frontend/src/lib/generation-protocol.ts` in the browser — and both run the cases in `intelligence-service/src/test/resources/protocol/cases.json` (`GenerationProtocolCasesTest`, `generation-protocol.test.ts`). **A new rule goes into that file first.** The browser's four readings are now one, and what it shows is only a preview: the saved turn replaces it when the turn ends.

What stays ambiguous is a file whose content holds both a literal `</file>` and, after it, a literal opening tag. No parser can tell that from two blocks without the model escaping its output.

### Paths are tidied, not compared byte for byte

A step used to be ticked only if its `<todo path>` matched a `<file path>` byte for byte, and one file written as `./src/App.tsx` made workspace-service reject the whole revision. Every path now goes through `llm/GeneratedPath` (and its twin in the browser) before anything compares or stores it: a leading `./` or `/`, backslashes and doubled slashes are tidied away, and a path that could never be stored — one with a `..` segment, a drive letter, a control or direction-override character, an exotic space — is refused on its own instead of costing the turn every other file. `ProjectFilePath` in workspace-service is still the boundary that keeps a traversing path out of storage.

### The server writes `<tool>`, not the model

The model was asked to announce each file read with a `<tool>` tag. It often forgot, and the obligation sat between a tool call and its answer where it was easiest to get wrong. The server knows when the read tool runs, so it writes the block into the turn's text itself. The model is told never to write one, and its own replies are shown back to it without them.

### The model's reasoning has a tag, and it is not called `think`

A turn's plan used to arrive inside a `<message>` as a numbered Markdown list — the same files the checklist listed under it. The reasoning now has a block of its own, `<approach>`, which the chat shows folded away, and a message may no longer hold a plan. The grammar reads `<think>` the same way (both become a `THINKING` event), because some models write one unprompted and their reasoning used to fall between blocks and be dropped — but the prompt never asks for it. A real model given a skeleton with a `<think>` line in it wrote every other line and left that one out: the name belongs to the reasoning that models and gateways handle themselves.

### A lesson is no longer part of the build

A teaching-mode `<learn>` was a walkthrough written after its file (a `<summary>` and one `<part>` per quoted line), then a `<what>` and a `<why>` written before it. Both lengthened the turn and put the first file later, so the person waited on explanations they had not opened. The build prompt now asks for nothing in teaching mode; a step's lesson is a separate request, made from the browser when the step is opened (`/code/lesson/stream`), written from what that step changed, in plain headed text rather than tags. The grammar still reads `<learn>`, unchanged, so lessons already saved in either older shape are shown, folded under their step.

### A question may follow files

`<ask>` used to mean a turn that wrote nothing. It may now also come after files: the model builds the part that does not depend on the answer, then asks. Nothing in the grammar changed; `TurnReview` already treated a turn that asks as complete, and the recorder publishes whatever files a completed turn holds.

### An existing file is changed with `<edit>`, not written out again

The protocol had one way to change a file: write it whole. Asked for a dark theme, a model rewrote nine files; the two longest each came back with a stray backslash at the end of one line, and the project stopped compiling. Asked to fix them, it rewrote both again, mended the lines it was shown and damaged three others. The longer the file a model repeats, the more often a line of it comes back wrong.

`<edit path="…">` holds only what changes: one or more blocks, each a run of the file's own lines under `<<<<<<< SEARCH`, then `=======`, then what replaces them, closed by `>>>>>>> REPLACE`. `<file>` is now for a new file, or one being mostly rewritten.

- **The grammar treats it exactly as it treats a file**: it needs a `path`, and its body is opaque - it holds code, and a `<Todo>` inside it is not a tag. A file or an edit ends at the closing tag of its own name.
- **The server applies it, and only the server** (`llm/FileEdits`). The run of lines must be found in exactly one place, looking strictest first: as written, then ignoring spaces at line ends, then ignoring indentation. More than one match is refused, not guessed at. An edit applies to the file as the same reply has left it so far, and otherwise to the stored file.
- **A path's edits land together or not at all.** If one cannot be applied, none of that path's edits are, and the model is asked again with the file printed as it stands and told which line of its copy differed.
- **What is checked and saved is always the whole file.** By the time a turn is recorded an edit has become a `FILE_EDIT` holding the complete file, so storage, the diff view and replayed history are unchanged. `FILE_PATCH`, the event an edit is parsed into, is never stored.
- **The browser does not apply edits.** A second implementation of "find these lines in that file" would be a second place for the two sides to disagree. While a reply streams, an edit ticks its step and shows the file as edited; the content arrives with the saved turn.
- **One reply, one tag per path** still holds for the model, but the parsers no longer keep only the last change to a path: they keep the last whole change (a file written or deleted) and every edit after it, since edits build on each other.

One real turn, changing two pages of 271 and 430 lines: 15 lines and 2 lines differed afterwards, in one call and about 1,800 output tokens.

### Continue, don't retry

The original recovery heuristic sent the same request again when a reply looked abandoned. That paid for every file twice, often stopped in the same place, and treated "read some files, then answer in words" as a failure. A reply that needs more is now continued: the model is shown what it wrote and asked only for the rest. See [in-turn recovery](../flows/ai-generation.md#in-turn-recovery).
