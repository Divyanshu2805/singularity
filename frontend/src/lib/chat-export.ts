import type { ChatMessage } from "@/components/ChatPanel";
import type { LensTurn } from "./code-lens-store";
import { ChatEventType, type ChatEvent } from "./types";

/**
 * Turning a conversation into a markdown file someone can keep.
 *
 * <p>Two conversations can be exported: the project chat and a code lens thread. Both are stored server-side,
 * but neither in a form anyone can read outside the app - this download is the readable copy.
 */

/**
 * Only the parts of a lens turn an export actually reads. Deliberately narrower than {@code LensTurn}: the
 * bookkeeping the panel needs (ids, streaming state, which saved note a turn belongs to) has nothing to do
 * with what the file says, and pinning the export to the full type made every test build one.
 */
export type ExportableLensTurn = Pick<LensTurn, "role" | "content" | "selection">;

/**
 * `projectname_kind_date_time.md`, e.g. `Notes-app_notes_2026-09-16_1745.md`. Filesystem-safe, sorts by date, and
 * unique enough that two exports don't overwrite each other. Local time, since that's the clock the reader knows.
 */
export function exportFilename(projectName: string, suffix: string, now = new Date()) {
  const safeName = projectName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${safeName}_${suffix}_${date}_${time}.md`;
}

function header(title: string, subtitle?: string) {
  const lines = [`# ${title}`, "", `_Exported ${new Date().toLocaleString()}_`];
  if (subtitle) lines.push("", subtitle);
  return lines.join("\n");
}

/** Fenced with a language hint when the path suggests one, so the snippet highlights in a markdown viewer. */
function fencedCode(code: string, path?: string) {
  const extension = path?.split(".").pop()?.toLowerCase() ?? "";
  const language = ["ts", "tsx", "js", "jsx", "json", "css", "html"].includes(extension) ? extension : "";
  // A fence has to be longer than the longest run of backticks inside it, or the code breaks out of it.
  const longestRun = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

/**
 * The project chat. An assistant turn's readable content lives in its events, not in `content` (which the
 * backend still fills with a placeholder), so messages are rebuilt from the events when there are any.
 */
export function buildChatMarkdown(messages: ChatMessage[], projectName: string): string {
  const parts: string[] = [header(`${projectName} - chat`)];

  for (const message of messages) {
    if (message.role === "user") {
      parts.push(`## You\n\n${message.content.trim()}`);
      continue;
    }

    const body = assistantBody(message);
    if (body) parts.push(`## VibeCraft\n\n${body}`);
  }

  if (parts.length === 1) parts.push("_This chat is empty._");
  return parts.join("\n\n") + "\n";
}

function assistantBody(message: ChatMessage): string {
  return assistantTurnText(message.events ?? [], message.content, message.error);
}

/**
 * One assistant turn as plain markdown, rebuilt from its events - the export's own shape, shared with the
 * copy button under a message so what lands on the clipboard matches what an exported chat says.
 *
 * <p>`fallback` is the raw text to use when there are no events at all (a turn that only spoke, or one whose
 * events were never saved).
 */
export function assistantTurnText(events: ChatEvent[], fallback = "", error?: string): string {
  if (events.length === 0) {
    return error ? `> Failed: ${error}` : fallback.trim();
  }

  const sections: string[] = [];
  const editedFiles: string[] = [];
  const steps: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case ChatEventType.MESSAGE:
        if (event.content?.trim()) sections.push(event.content.trim());
        break;
      case ChatEventType.TODO:
        if (event.content?.trim()) steps.push(`- ${event.content.trim()}`);
        break;
      case ChatEventType.FILE_EDIT:
        if (event.filePath) editedFiles.push(`- \`${event.filePath}\``);
        break;
      case ChatEventType.FILE_DELETE:
        if (event.filePath) editedFiles.push(`- \`${event.filePath}\` (deleted)`);
        break;
      case ChatEventType.LEARN:
        // The walkthrough body is the model's own markdown, kept verbatim rather than re-laid-out here.
        if (event.content?.trim()) {
          sections.push(`**How \`${event.filePath ?? "this"}\` works**\n\n${event.content.trim()}`);
        }
        break;
      default:
        break; // THOUGHT and TOOL_LOG are progress chatter, not part of the record.
    }
  }

  if (steps.length > 0) sections.unshift(`**Build steps**\n\n${steps.join("\n")}`);
  if (editedFiles.length > 0) sections.push(`**Files changed**\n\n${editedFiles.join("\n")}`);
  if (error) sections.push(`> Failed: ${error}`);

  return sections.join("\n\n");
}

/**
 * A code lens thread: the running conversation, with each snippet quoted where it was first asked about -
 * the same shape the panel shows, so an exported file reads as the history of the whole project rather than
 * of one selection.
 */
export function buildLensMarkdown(turns: ExportableLensTurn[], projectName: string): string {
  const parts = [header(`${projectName} - ExplainLLM notes`)];

  for (const turn of turns) {
    if (turn.selection) {
      const { path, startLine, endLine, code } = turn.selection;
      const range = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
      parts.push(`### \`${path}\` · ${range}\n\n${fencedCode(code, path)}`);
    }
    parts.push(`## ${turn.role === "user" ? "You" : "VibeCraft"}\n\n${turn.content.trim()}`);
  }

  if (turns.length === 0) parts.push("_Nothing discussed yet._");
  return parts.join("\n\n") + "\n";
}

/** Browser-side download of generated text - nothing is uploaded anywhere to produce it. */
export function downloadMarkdown(filename: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
