/**
 * What teaching mode keeps for a whole project: the tour, the glossary, and a step's "try changing this" task.
 *
 * Handles: reading a task into what to change, the line to look at and what counts as done; reading the check of a
 * task into its verdict and the words after it, while it is still arriving; and cleaning a typed word the way the
 * server does so the same word is the same entry everywhere.
 *
 * The tour and a glossary entry are read with the same readers a big picture is (lib/lesson.ts), since they are the
 * same shape of text: an opening, then headed sections. A task is plain headed text for the same reason a lesson is,
 * so a half-arrived task reads sensibly at every point and only a heading still being written is held back. Its
 * line-numbered heading is the lesson's own (`### L12 · Where to look`), so the chip beside it opens the editor at the
 * line the way a lesson's does.
 *
 * A check of a task answers on its first line with one of two words - `Done` or `Not yet` - and the sentences after
 * it. The first line decides, here and on the server alike: the server marks the task done when it reads `Done` there.
 */

export interface TaskView {
  task: string;
  startLine?: number;
  endLine?: number;
  where?: string;
  doneWhen?: string;
}

const LINE_HEADING = /^###[ \t]+L(\d+)(?:[ \t]*[-–—][ \t]*L?(\d+))?[ \t]*[·•|:–—-][ \t]*(\S.*?)[ \t]*$/;
const ANY_HEADING = /^###[ \t]+(\S.*?)[ \t]*$/;
const DONE_WHEN = /^done when\b/i;

const clean = (lines: string[]) => lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\*\*/g, "").trim();

export function parseTask(raw: string, isComplete: boolean): TaskView {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (!isComplete && lines.length > 0 && /^#/.test(lines[lines.length - 1])) lines.pop();

  const opening: string[] = [];
  const where: string[] = [];
  const doneWhen: string[] = [];
  let body = opening;
  let startLine: number | undefined;
  let endLine: number | undefined;

  for (const line of lines) {
    const located = LINE_HEADING.exec(line);
    if (located) {
      const first = Number(located[1]);
      const last = located[2] ? Number(located[2]) : first;
      startLine = Math.min(first, last);
      endLine = Math.max(first, last);
      body = where;
      continue;
    }
    const other = ANY_HEADING.exec(line);
    if (other) {
      body = DONE_WHEN.test(other[1].replace(/\*\*/g, "")) ? doneWhen : [];
      continue;
    }
    body.push(line);
  }

  const place = clean(where);
  const done = clean(doneWhen);
  return {
    task: clean(opening),
    ...(startLine !== undefined ? { startLine, endLine } : {}),
    ...(place ? { where: place } : {}),
    ...(done ? { doneWhen: done } : {}),
  };
}

export interface Verdict {
  state: "pending" | "done" | "notYet";
  detail: string;
}

const verdictWord = (line: string) => line.replace(/^[^\p{L}]+/u, "").toLowerCase();

export function parseVerdict(raw: string, isComplete: boolean): Verdict {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const newline = text.indexOf("\n");
  const first = newline < 0 ? text : text.slice(0, newline);
  const detail = newline < 0 ? "" : text.slice(newline + 1).replace(/\*\*/g, "").trim();
  const word = verdictWord(first);

  if (word.startsWith("done")) return { state: "done", detail };
  if (word.startsWith("not yet")) return { state: "notYet", detail };
  if (!isComplete) return { state: "pending", detail: "" };
  return { state: "notYet", detail: text.replace(/\*\*/g, "") };
}

const MAX_TERM_CHARS = 80;

export function cleanTerm(raw: string): string {
  const term = raw.replace(/[`*_\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return term.length > MAX_TERM_CHARS ? term.slice(0, MAX_TERM_CHARS).trim() : term;
}

export const termKey = (term: string) => cleanTerm(term).toLowerCase();

export function findEntry<T extends { term: string }>(entries: readonly T[] | undefined, term: string | null): T | undefined {
  if (!entries || !term) return undefined;
  const key = termKey(term);
  return entries.find((entry) => termKey(entry.term) === key);
}

export function filterEntries<T extends { term: string }>(entries: readonly T[], query: string): T[] {
  const needle = termKey(query);
  return needle ? entries.filter((entry) => termKey(entry.term).includes(needle)) : [...entries];
}

export const NOT_A_TERM = "This isn't a programming word.";

export const isNotATerm = (definition: string) => definition.trim().startsWith(NOT_A_TERM);
