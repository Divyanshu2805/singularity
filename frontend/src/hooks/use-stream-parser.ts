/**
 * Parses the model's tagged output into chat events while it is still arriving.
 *
 * Handles: recognising each tagged section and its attributes, treating everything outside the tags as message text,
 * telling the smooth reveal which ranges are readable text, and where it must stop so a half-arrived tag is never
 * shown; dropping every FILE_EDIT for a path but the last when the model re-outputs the same file, matching what the
 * backend's LlmResponseParser keeps once the turn is saved.
 *
 * It is deliberately lenient about a missing closing tag on the last element, because the stream may still be
 * mid-tag - a tag's content is bounded by the LAST occurrence of its closing tag before the next recognised tag
 * opens, falling back to searching the rest of the buffer, and finally to "still arriving" (open to the end of the
 * buffer) only when no closing tag exists at all. A plain first-match search would let a file whose own content
 * happens to contain a literal closing tag (documentation about this protocol, an example) get cut off early - the
 * same fix CODE_REVIEW.md AI-08 applies on the backend, kept in step here since the two parse the same text.
 */
import { useMemo } from 'react';
import { ChatEvent, ChatEventType } from '@/lib/types';
import type { TextRange } from './use-smooth-stream';

const TAG_NAMES = ["message", "file", "delete", "tool", "todo", "learn"];

const OPEN_TAG_REGEX = /<(tool|message|file|delete|todo|learn)\b([^>]*)>/gi;
const TAG_REGEX = /<(message|file|delete|tool|todo|learn)\b[^>]*>|<\/(message|file|delete|tool|todo|learn)>/gi;

const readAttr = (attrs: string, name: string) =>
  new RegExp(`${name}="([^"]*)"`, "i").exec(attrs)?.[1];

function findNextOpenStart(buffer: string, from: number): number {
  OPEN_TAG_REGEX.lastIndex = from;
  const match = OPEN_TAG_REGEX.exec(buffer);
  return match ? match.index : -1;
}

/** The end of `tag`'s content and whether a real closing tag was found for it, searched narrowest-bound first. */
function findContentEnd(buffer: string, lower: string, tag: string, contentStart: number, nextOpenStart: number) {
  const closeTag = `</${tag}>`;
  const narrowLimit = nextOpenStart === -1 ? buffer.length : nextOpenStart;

  let closeStart = lower.lastIndexOf(closeTag, Math.max(contentStart, narrowLimit - 1));
  if (closeStart >= contentStart && closeStart < narrowLimit) {
    return { end: closeStart, closeTagEnd: closeStart + closeTag.length, isComplete: true };
  }

  closeStart = lower.lastIndexOf(closeTag);
  if (closeStart >= contentStart) {
    return { end: closeStart, closeTagEnd: closeStart + closeTag.length, isComplete: true };
  }

  return { end: buffer.length, closeTagEnd: buffer.length, isComplete: false };
}

function buildEvent(tag: string, attrs: string, content: string, isComplete: boolean): ChatEvent {
  const base = { content: content.trim(), isComplete };

  switch (tag) {
    case "file":
      return { ...base, type: ChatEventType.FILE_EDIT, filePath: readAttr(attrs, "path") };
    case "delete":
      return { ...base, type: ChatEventType.FILE_DELETE, filePath: readAttr(attrs, "path") };
    case "tool":
      return { ...base, type: ChatEventType.TOOL_LOG, metadata: readAttr(attrs, "args") };
    case "todo":
      return { ...base, type: ChatEventType.TODO, filePath: readAttr(attrs, "path") };
    case "learn":
      return {
        ...base,
        type: ChatEventType.LEARN,
        filePath: readAttr(attrs, "path"),
        metadata: readAttr(attrs, "concept")?.trim() || undefined,
      };
    default:
      return { ...base, type: ChatEventType.MESSAGE };
  }
}

function dedupeFileEdits(events: ChatEvent[]): ChatEvent[] {
  const lastByPath = new Map<string, ChatEvent>();
  for (const event of events) {
    if (event.type === ChatEventType.FILE_EDIT && event.filePath) {
      lastByPath.set(event.filePath, event);
    }
  }
  return events.filter((event) =>
    event.type !== ChatEventType.FILE_EDIT || !event.filePath || lastByPath.get(event.filePath) === event);
}

export function parseStreamEvents(buffer: string): ChatEvent[] {
  const events: ChatEvent[] = [];
  const lower = buffer.toLowerCase();
  OPEN_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = OPEN_TAG_REGEX.exec(buffer)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const contentStart = OPEN_TAG_REGEX.lastIndex;

    const nextOpenStart = findNextOpenStart(buffer, contentStart);
    const { end, closeTagEnd, isComplete } = findContentEnd(buffer, lower, tag, contentStart, nextOpenStart);

    events.push(buildEvent(tag, attrs, buffer.slice(contentStart, end), isComplete));

    if (!isComplete) {
      break; // still arriving - nothing after an unclosed tag can be a complete event yet
    }
    OPEN_TAG_REGEX.lastIndex = closeTagEnd;
  }

  return dedupeFileEdits(events);
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
