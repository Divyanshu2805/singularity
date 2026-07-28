/**
 * Parses the model's tagged output into chat events while it is still arriving.
 *
 * Handles: recognising each tagged section and its attributes, treating everything outside the tags as message text,
 * telling the smooth reveal which ranges are readable text, and where it must stop so a half-arrived tag is never
 * shown.
 *
 * It is deliberately lenient about a missing closing tag on the last element, because the stream may still be
 * mid-tag.
 */
import { useMemo } from 'react';
import { ChatEvent, ChatEventType } from '@/lib/types';
import type { TextRange } from './use-smooth-stream';

const TAG_NAMES = ["message", "file", "delete", "tool", "todo", "learn"];

const PARSE_REGEX = /<(tool|message|file|delete|todo|learn)\b([^>]*)>([\s\S]*?)(<\/\1>|$)/gi;
const TAG_REGEX = /<(message|file|delete|tool|todo|learn)\b[^>]*>|<\/(message|file|delete|tool|todo|learn)>/gi;

const readAttr = (attrs: string, name: string) =>
  new RegExp(`${name}="([^"]*)"`, "i").exec(attrs)?.[1];

export function parseStreamEvents(buffer: string): ChatEvent[] {
  const events: ChatEvent[] = [];
  PARSE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PARSE_REGEX.exec(buffer)) !== null) {
    const [, tag, attrs, content, closing] = match;
    const base = { content: content.trim(), isComplete: closing !== "" };

    switch (tag.toLowerCase()) {
      case "file":
        events.push({ ...base, type: ChatEventType.FILE_EDIT, filePath: readAttr(attrs, "path") });
        break;
      case "delete":
        events.push({ ...base, type: ChatEventType.FILE_DELETE, filePath: readAttr(attrs, "path") });
        break;
      case "tool":
        events.push({ ...base, type: ChatEventType.TOOL_LOG, metadata: readAttr(attrs, "args") });
        break;
      case "todo":
        events.push({ ...base, type: ChatEventType.TODO, filePath: readAttr(attrs, "path") });
        break;
      case "learn":
        events.push({
          ...base,
          type: ChatEventType.LEARN,
          filePath: readAttr(attrs, "path"),
          metadata: readAttr(attrs, "concept")?.trim() || undefined,
        });
        break;
      default:
        events.push({ ...base, type: ChatEventType.MESSAGE });
    }
  }

  return events;
}

export function findVisibleRanges(raw: string): TextRange[] {
  const ranges: TextRange[] = [];
  let open: { name: string; bodyStart: number } | null = null;
  TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_REGEX.exec(raw)) !== null) {
    const openName = match[1]?.toLowerCase();
    const closeName = match[2]?.toLowerCase();
    if (openName && !open) {
      open = { name: openName, bodyStart: match.index + match[0].length };
    } else if (closeName && open?.name === closeName) {
      if (closeName === "message") ranges.push([open.bodyStart, match.index]);
      open = null;
    }
  }
  if (open?.name === "message") ranges.push([open.bodyStart, raw.length]);
  return ranges;
}

export function findSafeEnd(raw: string): number {
  const lt = raw.lastIndexOf("<");
  if (lt === -1) return raw.length;
  const tail = raw.slice(lt + 1);
  if (tail.includes(">")) return raw.length;

  const isClosing = tail.startsWith("/");
  const body = isClosing ? tail.slice(1) : tail;
  const name = (/^[a-z]*/i.exec(body)?.[0] ?? "").toLowerCase();
  const rest = body.slice(name.length);
  const couldBeTag = rest.length === 0
    ? TAG_NAMES.some((tag) => tag.startsWith(name))
    : !isClosing && TAG_NAMES.includes(name) && /^\s/.test(rest);

  return couldBeTag ? lt : raw.length;
}

export const useStreamParser = (streamBuffer: string) =>
  useMemo(() => parseStreamEvents(streamBuffer), [streamBuffer]);
