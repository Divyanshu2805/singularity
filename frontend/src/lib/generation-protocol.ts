/**
 * The build chat's tagged text, read into chat events - the browser's copy of the server's parser.
 *
 * Handles: finding each tagged block and where its body ends, giving it its meaning (a message, a file to write or
 * delete, a change to part of a file, a checklist step, a lesson, a read log, a question with its suggested answers, the model's own
 * working-out), the limits a turn is held to, and - because this runs while the answer is still arriving - reporting the one block the text has stopped
 * inside of as an event that is not complete yet. It also tells the smooth reveal which ranges are readable prose and
 * where it must stop so a half-arrived tag is never shown. Only a message is typed out: the model's working-out arrives
 * whole and is shown one step at a time by the chat itself (hooks/use-step-reveal.ts), which typing it as well would
 * fight with.
 *
 * The rules are the server's, in `GenerationProtocol.java` and `LlmResponseParser.java`, and the two are held together
 * by one file of cases both run (`intelligence-service/src/test/resources/protocol/cases.json`):
 *  - a tag name is exactly message, file, edit, delete, tool, todo, learn, ask, approach or think, in lower case,
 *    followed only by well-formed attributes; a file, edit or delete is a tag only with a path;
 *  - a file's body is opaque and so is an edit's, and ends at the first closing tag of its own name that is the last
 *    before the next file or edit opens or that is followed by another opening tag before the next such closing tag;
 *  - every other block ends at its last closing tag before the next opening tag;
 *  - a block that never closes is not a block;
 *  - blank and trimmed mean the six plain space characters and no others, and a path holding any other kind of
 *    space is refused - `String.prototype.trim` and Java's `strip` disagree about the rest, so neither is used.
 *
 * This file exists because there used to be four readings of that text - the server's, a parser for the chat, a
 * regular expression for files in the API layer and two more in the chat store - and they disagreed. A file holding
 * `useState<Todo[]>` was thrown away by the server, which read the generic as a checklist tag, while the browser
 * showed it as written. There is one reading here now, and everything in the browser that needs to know what a turn
 * wrote asks it.
 *
 * An edit changes part of a file that already exists. Only the server applies one - it alone has the file as it is
 * stored, and a second implementation of finding a run of lines in a file would be one more place for the two to
 * disagree. So here an edit is an event that says a path was changed and carries the edit's own text, never the
 * file: the checklist ticks its step, and the file's new content arrives with the saved turn.
 *
 * What it shows is still only a preview. The server says how a turn really ended, and the chat replaces this
 * reading with the saved turn the moment it does.
 */
import { ChatEvent, ChatEventType } from "./types";

type Tag = "message" | "file" | "edit" | "delete" | "tool" | "todo" | "learn" | "ask" | "approach" | "think";
type Attributes = Record<string, string>;

interface OpenTag {
  tag: Tag;
  attributes: Attributes;
  start: number;
  end: number;
}

export interface ProtocolBlock {
  tag: Tag;
  attributes: Attributes;
  body: string;
  bodyStart: number;
  bodyEnd: number;
  start: number;
  end: number;
}

export interface DanglingBlock {
  tag: Tag;
  attributes: Attributes;
  body: string;
  bodyStart: number;
  start: number;
}

export type TextRange = readonly [start: number, end: number];

const TAG_NAMES: readonly Tag[] = ["message", "file", "edit", "delete", "tool", "todo", "learn", "ask", "approach", "think"];
const SPACE = "[ \\t\\r\\n]";
const ATTRIBUTE = `${SPACE}+[A-Za-z][\\w-]*${SPACE}*=${SPACE}*(?:"[^"]*"|'[^']*')`;
const OPEN_TAG = new RegExp(`<(${TAG_NAMES.join("|")})((?:${ATTRIBUTE})*)${SPACE}*>`);
const ATTRIBUTE_PAIR = new RegExp(`([A-Za-z][\\w-]*)${SPACE}*=${SPACE}*(?:"([^"]*)"|'([^']*)')`);
const FORMAT_CHARACTER = /\p{Cf}/u;
const OTHER_SPACE = /[\p{Zs}\p{Zl}\p{Zp}]/u;
const PLAIN_SPACE_RUN = /[ \t\n\r\f\v]+/g;
const PART_CONCEPT = /<part\b[^>]*?\bconcept="([^"]+)"/gi;

const MAX_PATH_LENGTH = 400;
const MAX_CHECKLIST_STEPS = 12;
const MAX_QUESTIONS_PER_TURN = 3;
const MAX_ANSWER_OPTIONS = 6;
const MAX_ANSWER_OPTION_CHARS = 80;

const closing = (tag: Tag) => `</${tag}>`;
const isOpaque = (tag: Tag) => tag === "file" || tag === "edit";
const isSpace = (character: string) =>
  character === " " || character === "\t" || character === "\n" || character === "\r" || character === "\f" || character === "\v";

function trim(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isSpace(text[start])) start++;
  while (end > start && isSpace(text[end - 1])) end--;
  return text.slice(start, end);
}

function readAttributes(raw: string): Attributes {
  const attributes: Attributes = {};
  const pattern = new RegExp(ATTRIBUTE_PAIR.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    attributes[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

function findOpens(text: string): OpenTag[] {
  const opens: OpenTag[] = [];
  const pattern = new RegExp(OPEN_TAG.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const tag = match[1] as Tag;
    const attributes = readAttributes(match[2]);
    if ((isOpaque(tag) || tag === "delete") && !trim(attributes.path ?? "")) continue;
    opens.push({ tag, attributes, start: match.index, end: match.index + match[0].length });
  }
  return opens;
}

function nextOpaqueStart(opens: OpenTag[], index: number): number {
  for (let next = index + 1; next < opens.length; next++) {
    if (isOpaque(opens[next].tag)) return opens[next].start;
  }
  return -1;
}

function isUnbounded(opens: OpenTag[], index: number): boolean {
  return isOpaque(opens[index].tag) ? nextOpaqueStart(opens, index) < 0 : index === opens.length - 1;
}

function plainClose(text: string, opens: OpenTag[], index: number): number {
  const open = opens[index];
  const closeTag = closing(open.tag);
  const bound = index + 1 < opens.length ? opens[index + 1].start : text.length;
  if (bound - closeTag.length < 0) return -1;
  const close = text.lastIndexOf(closeTag, bound - closeTag.length);
  return close >= open.end ? close : -1;
}

function hasOpenBetween(opens: OpenTag[], after: number, from: number, to: number): boolean {
  for (let next = after + 1; next < opens.length; next++) {
    const start = opens[next].start;
    if (start >= to) return false;
    if (start >= from) return true;
  }
  return false;
}

function opaqueClose(text: string, opens: OpenTag[], index: number): number {
  const open = opens[index];
  const closeTag = closing(open.tag);
  const nextOpaque = nextOpaqueStart(opens, index);
  const bound = nextOpaque < 0 ? text.length : nextOpaque;

  const candidates: number[] = [];
  for (let at = text.indexOf(closeTag, open.end); at >= 0 && at + closeTag.length <= bound; at = text.indexOf(closeTag, at + closeTag.length)) {
    candidates.push(at);
  }
  for (let candidate = 0; candidate < candidates.length - 1; candidate++) {
    if (hasOpenBetween(opens, index, candidates[candidate] + closeTag.length, candidates[candidate + 1])) {
      return candidates[candidate];
    }
  }
  return candidates.length === 0 ? -1 : candidates[candidates.length - 1];
}

export function scanProtocol(text: string): { blocks: ProtocolBlock[]; dangling: DanglingBlock | null } {
  const opens = findOpens(text);
  const blocks: ProtocolBlock[] = [];
  let dangling: DanglingBlock | null = null;
  let cursor = 0;

  for (let index = 0; index < opens.length; index++) {
    const open = opens[index];
    if (open.start < cursor) continue;
    const close = isOpaque(open.tag) ? opaqueClose(text, opens, index) : plainClose(text, opens, index);
    if (close < 0) {
      if (!dangling && isUnbounded(opens, index)) {
        dangling = { tag: open.tag, attributes: open.attributes, body: text.slice(open.end), bodyStart: open.end, start: open.start };
      }
      continue;
    }
    const end = close + closing(open.tag).length;
    blocks.push({ tag: open.tag, attributes: open.attributes, body: text.slice(open.end, close), bodyStart: open.end, bodyEnd: close, start: open.start, end });
    cursor = end;
  }
  return { blocks, dangling };
}

export function normalizePath(raw: string | undefined): string | undefined {
  if (!raw || !trim(raw)) return undefined;
  const candidate = trim(raw).normalize("NFC").replace(/\\/g, "/");
  if (candidate.length >= 2 && candidate[1] === ":") return undefined;
  for (const character of candidate) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f || FORMAT_CHARACTER.test(character)) return undefined;
    if (character !== " " && OTHER_SPACE.test(character)) return undefined;
  }

  const segments: string[] = [];
  for (const segment of candidate.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return undefined;
    segments.push(segment);
  }
  const path = segments.join("/");
  if (!path || path.length > MAX_PATH_LENGTH || candidate.endsWith("/")) return undefined;
  return path;
}

function fileContent(body: string, isComplete: boolean): string {
  let firstContent = 0;
  while (firstContent < body.length && isSpace(body[firstContent])) firstContent++;
  if (firstContent === body.length) return "";
  const lineStart = body.lastIndexOf("\n", firstContent - 1) + 1;
  let end = body.length;
  while (isSpace(body[end - 1])) end--;
  return body.slice(lineStart, end) + (isComplete ? "\n" : "");
}

function answerOptions(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const options: string[] = [];
  for (const option of raw.split("|")) {
    const text = trim(option.replace(PLAIN_SPACE_RUN, " "));
    if (!text || options.includes(text)) continue;
    options.push(text.length > MAX_ANSWER_OPTION_CHARS ? trim(text.slice(0, MAX_ANSWER_OPTION_CHARS)) : text);
    if (options.length === MAX_ANSWER_OPTIONS) break;
  }
  return options.length === 0 ? undefined : options.join("|");
}

function lessonConcepts(tagConcept: string | undefined, body: string): string | undefined {
  const concepts = new Map<string, string>();
  const add = (concept: string | undefined) => {
    if (concept === undefined) return;
    const name = trim(concept.replace(/,/g, " ").replace(PLAIN_SPACE_RUN, " "));
    if (name && !concepts.has(name.toLowerCase())) concepts.set(name.toLowerCase(), name);
  };
  add(tagConcept);
  for (const match of body.matchAll(PART_CONCEPT)) add(match[1]);
  return concepts.size === 0 ? undefined : [...concepts.values()].join(", ");
}

interface Limits {
  checklistSteps: number;
  questions: number;
  lessonPaths: Set<string>;
}

function toEvent(
  tag: Tag,
  attributes: Attributes,
  rawBody: string,
  isComplete: boolean,
  limits: Limits
): ChatEvent | undefined {
  const body = trim(rawBody);
  const path = normalizePath(attributes.path);

  switch (tag) {
    case "message":
      return body ? { type: ChatEventType.MESSAGE, content: body, isComplete } : undefined;
    case "file":
      return path ? { type: ChatEventType.FILE_EDIT, content: fileContent(rawBody, isComplete), filePath: path, isComplete } : undefined;
    case "edit":
      return path ? { type: ChatEventType.FILE_PATCH, content: fileContent(rawBody, isComplete), filePath: path, isComplete } : undefined;
    case "delete":
      return path ? { type: ChatEventType.FILE_DELETE, content: body, filePath: path, isComplete } : undefined;
    case "tool":
      return { type: ChatEventType.TOOL_LOG, content: body, metadata: attributes.args, isComplete };
    case "todo":
      if (!body || ++limits.checklistSteps > MAX_CHECKLIST_STEPS) return undefined;
      return { type: ChatEventType.TODO, content: body, filePath: path, isComplete };
    case "learn":
      if (!body) return undefined;
      if (path) {
        if (limits.lessonPaths.has(path)) return undefined;
        limits.lessonPaths.add(path);
      }
      return { type: ChatEventType.LEARN, content: body, filePath: path, metadata: lessonConcepts(attributes.concept, body), isComplete };
    case "ask":
      if (!body || ++limits.questions > MAX_QUESTIONS_PER_TURN) return undefined;
      return { type: ChatEventType.ASK, content: body, metadata: answerOptions(attributes.options), isComplete };
    case "approach":
    case "think":
      return body ? { type: ChatEventType.THINKING, content: body, isComplete } : undefined;
  }
}

const replacesTheFile = (event: ChatEvent) => event.type === ChatEventType.FILE_EDIT || event.type === ChatEventType.FILE_DELETE;
const isFileChange = (event: ChatEvent) => replacesTheFile(event) || event.type === ChatEventType.FILE_PATCH;

function keepCurrentChangesPerPath(events: ChatEvent[]): ChatEvent[] {
  const lastWholeChange = new Map<string, number>();
  events.forEach((event, index) => {
    if (replacesTheFile(event) && event.filePath) lastWholeChange.set(event.filePath, index);
  });
  return events.filter((event, index) =>
    !isFileChange(event) || !event.filePath || index >= (lastWholeChange.get(event.filePath) ?? -1));
}

export function parseGenerationText(text: string, options: { streaming: boolean }): ChatEvent[] {
  const { blocks, dangling } = scanProtocol(text);
  const stillArriving = options.streaming ? dangling : null;
  const limits: Limits = { checklistSteps: 0, questions: 0, lessonPaths: new Set() };

  const events: ChatEvent[] = [];
  for (const block of blocks) {
    if (stillArriving && block.start > stillArriving.start) break;
    const event = toEvent(block.tag, block.attributes, block.body, true, limits);
    if (event) events.push(event);
  }
  const complete = keepCurrentChangesPerPath(events);
  if (!stillArriving) return complete;

  const arriving = toEvent(stillArriving.tag, stillArriving.attributes, stillArriving.body, false, limits);
  return arriving ? [...complete, arriving] : complete;
}

const isProse = (tag: Tag) => tag === "message";

export function findVisibleRanges(raw: string): TextRange[] {
  const { blocks, dangling } = scanProtocol(raw);
  const ranges: TextRange[] = [];
  for (const block of blocks) {
    if (dangling && block.start > dangling.start) break;
    if (isProse(block.tag)) ranges.push([block.bodyStart, block.bodyEnd]);
  }
  if (dangling && isProse(dangling.tag)) ranges.push([dangling.bodyStart, raw.length]);
  return ranges;
}

export function findSafeEnd(raw: string): number {
  const lt = raw.lastIndexOf("<");
  if (lt === -1) return raw.length;
  const tail = raw.slice(lt + 1);
  if (tail.includes(">")) return raw.length;

  const isClosing = tail.startsWith("/");
  const body = isClosing ? tail.slice(1) : tail;
  const name = /^[a-z]*/.exec(body)?.[0] ?? "";
  const rest = body.slice(name.length);
  const couldBeTag = rest.length === 0
    ? TAG_NAMES.some((tag) => tag.startsWith(name))
    : !isClosing && (TAG_NAMES as readonly string[]).includes(name) && isSpace(rest[0]);

  return couldBeTag ? lt : raw.length;
}

export interface TurnFiles {
  written: Map<string, string>;
  deleted: Set<string>;
  arriving: { path: string; content: string } | null;
  edited: string[];
  plannedPaths: string[];
}

export function turnFiles(events: readonly ChatEvent[]): TurnFiles {
  const written = new Map<string, string>();
  const deleted = new Set<string>();
  const plannedPaths: string[] = [];
  const edited: string[] = [];
  let arriving: TurnFiles["arriving"] = null;

  for (const event of events) {
    if (!event.filePath) continue;
    if (event.type === ChatEventType.TODO) {
      if (!plannedPaths.includes(event.filePath)) plannedPaths.push(event.filePath);
    } else if (event.type === ChatEventType.FILE_EDIT) {
      if (event.isComplete === false) arriving = { path: event.filePath, content: event.content };
      else written.set(event.filePath, event.content);
    } else if (event.type === ChatEventType.FILE_PATCH) {
      if (event.isComplete !== false && !edited.includes(event.filePath)) edited.push(event.filePath);
    } else if (event.type === ChatEventType.FILE_DELETE && event.isComplete !== false) {
      deleted.add(event.filePath);
    }
  }
  return { written, deleted, arriving, edited, plannedPaths };
}
