# 0004. A tag-based protocol for AI output

**Status:** Accepted

## Context

A generation turn produces a mix of things: a plan, messages to the user, whole-file edits, deletions, tool calls, and — in teaching mode — explanations. The user should see it happen live, with a checklist that ticks off as each file is written. A single structured-output JSON document can't be rendered meaningfully until it is complete, and one malformed field can invalidate the whole response.

## Decision

The system prompt (`llm/PromptUtils.java`) defines a small XML-like tag protocol — `<message>`, `<todo path="…">`, `<file path="…">`, `<delete>`, `<tool>`, and `<learn>` in teaching mode. The raw text is streamed to the browser as it arrives and parsed incrementally there (`use-stream-parser.ts`). When the stream completes, the server parses the same text into typed `ChatEvent` rows (`LlmResponseParser`) and publishes the file changes as one revision.

A checklist item is ticked off when a `<file>` appears whose `path` matches a `<todo>`'s `path` byte for byte.

## Consequences

- Output renders progressively, and one bad block doesn't discard the rest of a turn.
- The client and server must agree on the protocol; changes to it touch both parsers.
- Recovery heuristics are possible within a turn — for example, retrying once when the model narrates an edit but emits no `<file>` block.
- The read-only code-insight prompts deliberately never mention this protocol, so that path cannot write files. See [AI prompt boundaries](../security-model.md#ai-prompt-boundaries).
