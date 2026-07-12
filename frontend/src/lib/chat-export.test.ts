import { describe, it, expect } from "vitest";
import { buildChatMarkdown, buildLensMarkdown, exportFilename } from "./chat-export";
import type { ChatMessage } from "@/components/ChatPanel";
import { ChatEventType } from "./types";
import type { ChatEvent, CodeSelection } from "./types";

const event = (type: ChatEventType, content: string, filePath?: string): ChatEvent =>
  ({ type, content, filePath });

describe("buildChatMarkdown", () => {
  it("writes each side of the conversation under its own heading", () => {
    const markdown = buildChatMarkdown(
      [
        { id: "1", role: "user", content: "Add a navbar" },
        { id: "2", role: "assistant", content: "", events: [event(ChatEventType.MESSAGE, "Done - added the navbar.")] },
      ],
      "My App"
    );

    expect(markdown).toContain("# My App - chat");
    expect(markdown).toContain("## You\n\nAdd a navbar");
    expect(markdown).toContain("## VibeCraft\n\nDone - added the navbar.");
  });

  it("rebuilds an assistant turn from its events, not the placeholder content the backend stores", () => {
    // ChatMessage.content for an assistant row is a known placeholder; the readable text lives in the events.
    const markdown = buildChatMarkdown(
      [{
        id: "1",
        role: "assistant",
        content: "Assistant Message here...",
        events: [event(ChatEventType.MESSAGE, "Here's what I changed.")],
      }],
      "App"
    );

    expect(markdown).toContain("Here's what I changed.");
    expect(markdown).not.toContain("Assistant Message here...");
  });

  it("keeps the build steps and the files changed, and drops the progress chatter", () => {
    const markdown = buildChatMarkdown(
      [{
        id: "1",
        role: "assistant",
        content: "",
        events: [
          event(ChatEventType.THOUGHT, "Thought for 4s"),
          event(ChatEventType.TOOL_LOG, "Reading files..."),
          event(ChatEventType.TODO, "Building the header", "src/Header.tsx"),
          event(ChatEventType.MESSAGE, "All set."),
          event(ChatEventType.FILE_EDIT, "…", "src/Header.tsx"),
        ],
      }],
      "App"
    );

    expect(markdown).toContain("**Build steps**");
    expect(markdown).toContain("- Building the header");
    expect(markdown).toContain("**Files changed**");
    expect(markdown).toContain("- `src/Header.tsx`");
    // A transcript shouldn't carry "Thought for 4s" or tool noise.
    expect(markdown).not.toContain("Thought for 4s");
    expect(markdown).not.toContain("Reading files...");
  });

  it("keeps a teaching-mode walkthrough, labelled with the file it explains", () => {
    const markdown = buildChatMarkdown(
      [{
        id: "1",
        role: "assistant",
        content: "",
        events: [event(ChatEventType.LEARN, "`useState` stores a value across renders.", "src/App.tsx")],
      }],
      "App"
    );

    expect(markdown).toContain("**How `src/App.tsx` works**");
    expect(markdown).toContain("`useState` stores a value across renders.");
  });

  it("records a failed turn rather than exporting it as if it succeeded", () => {
    const markdown = buildChatMarkdown(
      [{ id: "1", role: "assistant", content: "", error: "Rate limited" }],
      "App"
    );
    expect(markdown).toContain("> Failed: Rate limited");
  });

  it("says so when there is nothing to export", () => {
    expect(buildChatMarkdown([], "App")).toContain("_This chat is empty._");
  });
});

describe("buildLensMarkdown", () => {
  const selection: CodeSelection = {
    path: "src/Counter.tsx",
    code: "const [count, setCount] = useState(0);",
    startLine: 4,
    endLine: 4,
  };

  it("quotes each snippet where it was first asked about, inline in the transcript", () => {
    const markdown = buildLensMarkdown([
      { role: "user", content: "Explain this", selection },
      { role: "assistant", content: "It stores the count." },
    ], "My App");

    expect(markdown).toContain("### `src/Counter.tsx` · line 4");
    expect(markdown).toContain("```tsx\nconst [count, setCount] = useState(0);\n```");
    // The snippet comes before the turn that asked about it, not in a header above everything.
    expect(markdown.indexOf("src/Counter.tsx")).toBeLessThan(markdown.indexOf("Explain this"));
  });

  it("reads as a history of the whole project when several blocks were discussed", () => {
    const other: CodeSelection = { path: "src/App.tsx", code: "<Route path='*' />", startLine: 9, endLine: 12 };
    const markdown = buildLensMarkdown([
      { role: "user", content: "Explain this", selection },
      { role: "assistant", content: "It stores the count." },
      { role: "user", content: "And this one?", selection: other },
      { role: "assistant", content: "That's the catch-all route." },
    ], "App");

    expect(markdown).toContain("### `src/Counter.tsx` · line 4");
    expect(markdown).toContain("### `src/App.tsx` · lines 9-12");
    expect(markdown.indexOf("src/Counter.tsx")).toBeLessThan(markdown.indexOf("src/App.tsx"));
  });

  it("does not re-quote a snippet for a follow-up about the same block", () => {
    const markdown = buildLensMarkdown([
      { role: "user", content: "Explain this", selection },
      { role: "assistant", content: "It stores the count." },
      { role: "user", content: "What does the 0 do?" },
    ], "App");

    expect(markdown.match(/### `src\/Counter\.tsx`/g)).toHaveLength(1);
  });

  it("keeps the conversation in order under speaker headings", () => {
    const markdown = buildLensMarkdown([
      { role: "assistant", content: "It stores the count." },
      { role: "user", content: "What does the 0 do?" },
    ], "App");

    expect(markdown).toContain("## VibeCraft\n\nIt stores the count.");
    expect(markdown).toContain("## You\n\nWhat does the 0 do?");
  });

  it("fences code containing backticks without the snippet breaking out", () => {
    const withTicks: CodeSelection = { ...selection, code: 'const s = `a ${b} c`;' };
    const markdown = buildLensMarkdown([{ role: "user", content: "?", selection: withTicks }], "App");

    const fence = markdown.match(/(`{3,})tsx/)?.[1] ?? "";
    expect(fence.length).toBeGreaterThanOrEqual(3);
    expect(markdown).toContain(`${fence}tsx\nconst s = \`a \${b} c\`;\n${fence}`);
  });

  it("says so when there is nothing to export", () => {
    expect(buildLensMarkdown([], "App")).toContain("_Nothing discussed yet._");
  });
});

describe("exportFilename", () => {
  it("makes a project name safe to use as a filename", () => {
    expect(exportFilename("My App: v2/final", "chat")).toMatch(/^My-App-v2-final_chat_\d{4}-\d{2}-\d{2}_\d{4}\.md$/);
  });

  it("names a notes export projectname_notes_date_time, in local time", () => {
    expect(exportFilename("Notes app", "notes", new Date(2026, 8, 16, 17, 45))).toBe("Notes-app_notes_2026-09-16_1745.md");
  });

  it("falls back to a usable name when the project name has nothing safe in it", () => {
    expect(exportFilename("///", "chat")).toMatch(/^project_chat_/);
  });
});
