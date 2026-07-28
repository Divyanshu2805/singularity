/**
 * Turning a conversation into a markdown file someone can keep.
 *
 * Handles: a filename that is filesystem-safe, sorts by date and is unique enough that two exports do not collide;
 * rendering both the project chat and a code lens thread; and triggering the download.
 *
 * Both conversations are stored server-side, but neither in a form anyone can read outside the app - this download is
 * the readable copy. The lens turn type here is deliberately narrower than the store's: the bookkeeping the panel
 * needs has nothing to do with what the file says.
 */
import type { ChatMessage } from "@/components/ChatPanel";
import type { LensTurn } from "./code-lens-store";
import { ChatEventType, type ChatEvent } from "./types";

export type ExportableLensTurn = Pick<LensTurn, "role" | "content" | "selection">;

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

function fencedCode(code: string, path?: string) {
  const extension = path?.split(".").pop()?.toLowerCase() ?? "";
  const language = ["ts", "tsx", "js", "jsx", "json", "css", "html"].includes(extension) ? extension : "";
  const longestRun = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

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
        if (event.content?.trim()) {
          sections.push(`**How \`${event.filePath ?? "this"}\` works**\n\n${event.content.trim()}`);
        }
        break;
      default:
        break;
    }
  }

  if (steps.length > 0) sections.unshift(`**Build steps**\n\n${steps.join("\n")}`);
  if (editedFiles.length > 0) sections.push(`**Files changed**\n\n${editedFiles.join("\n")}`);
  if (error) sections.push(`> Failed: ${error}`);

  return sections.join("\n\n");
}

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
