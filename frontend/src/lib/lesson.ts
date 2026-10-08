/**
 * Teaching-mode lessons: what the AI wrote about a file, in each of the shapes it has had.
 *
 * Handles: parsing the older lesson bodies in either of their two shapes, collecting the concepts they introduce,
 * resolving a quoted line back to a line number in the file as it is now, reading a streamed walkthrough into its
 * overview and line-ranged sections, and cutting a section's lines out of the file for display.
 *
 * A lesson is now two pieces of plain text written before its file - what the step adds, and why the project needs it
 * at that point - so the steps of a build read in order. It used to be a walkthrough written after the file: a
 * summary and one part per piece of code, each quoting a line. Conversations saved in that shape are still read and
 * shown, which is why both are parsed here; the "what" of a new lesson and the summary of an old one land in the same
 * field, so everything that shows a lesson's first paragraph works for both.
 *
 * The quoted line is searched for again when a lesson is opened rather than trusted as a stored line number, because
 * the file may have changed since the lesson was written.
 *
 * A walkthrough is the newer, separate kind: the lesson on what one step of a turn changed, asked for from the code
 * lens endpoint when the person opens the step and streamed back as an opening followed by one section per piece of
 * the change, each headed with the lines it is about (`### L12-18 · Title`), and a closing section under a heading
 * with no lines (`### What happens next`). The sections come in the order the idea needs, which is not always the
 * order of the lines, so nothing here assumes ascending ranges. It is plain headed text rather than tags, so a
 * half-arrived answer reads sensibly at every point: only a heading line still being written is held back, and the
 * last section is reported as not complete until the next heading or the end of the stream shows it is.
 */
export interface CodeTarget {
  line?: number;
  endLine?: number;
  code?: string;
}

export interface LessonPart {
  code?: string;
  line?: number;
  text: string;
  concept?: string;
}

export interface Lesson {
  summary: string;
  why?: string;
  parts: LessonPart[];
  concepts: string[];
}

const STEP_STRUCTURE = /<(what|why)\b/i;
const WHAT = /<what>([\s\S]*?)(?:<\/what>|(?=<why\b)|$)/i;
const WHY = /<why>([\s\S]*?)(?:<\/why>|$)/i;

const STRUCTURE = /<(summary|part|related)\b/i;
const SUMMARY = /<summary>([\s\S]*?)(?:<\/summary>|(?=<part\b|<related\b)|$)/i;
const PART = /<part\b([^>]*)>([\s\S]*?)(?:<\/part>|(?=<part\b|<related\b)|$)/gi;
const CODE = /<code>([\s\S]*?)(?:<\/code>|$)/i;
const STRAY_TAG = /<\/?(?:summary|part|code|related|what|why)\b[^>]*>|<\/?[a-z]*$/gi;

const readAttr = (attrs: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`, "i").exec(attrs)?.[1]?.trim() || undefined;

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(lt|gt|quot|apos);/g, (_, name: string) => NAMED_ENTITIES[name])
    .replace(/&amp;/g, "&");

const cleanText = (text: string) => decodeEntities(text.replace(STRAY_TAG, "")).trim();

export function withoutLeadingConcept(text: string, concept: string | undefined, isComplete: boolean) {
  if (!concept) return text;
  const name = concept.toLowerCase();
  const lower = text.toLowerCase();
  if (!isComplete && name.startsWith(lower)) return "";
  if (!lower.startsWith(name) || /\w/.test(text.charAt(concept.length))) return text;
  return text.slice(concept.length).replace(/^[\s,:;.–—-]+/, "") || text;
}

export function parseLesson(content: string, singleConcept?: string, isComplete = true): Lesson {
  if (STEP_STRUCTURE.test(content) && !STRUCTURE.test(content)) {
    const why = cleanText(WHY.exec(content)?.[1] ?? "");
    return {
      summary: cleanText(WHAT.exec(content)?.[1] ?? ""),
      ...(why ? { why } : {}),
      parts: [],
      concepts: singleConcept ? singleConcept.split(",").map((concept) => concept.trim()).filter(Boolean) : [],
    };
  }

  if (!STRUCTURE.test(content)) {
    const concepts = singleConcept ? [singleConcept] : [];
    return { summary: withoutLeadingConcept(content.trim(), singleConcept, isComplete), parts: [], concepts };
  }

  const summary = cleanText(SUMMARY.exec(content)?.[1] ?? "");

  const parts: LessonPart[] = [];
  for (const [, attrs, body] of content.matchAll(PART)) {
    const code = CODE.exec(body)?.[1];
    parts.push({
      code: code && decodeEntities(code).trim() ? decodeEntities(code) : undefined,
      text: cleanText(body.replace(CODE, "")),
      concept: readAttr(attrs, "concept"),
    });
  }

  const concepts = [...new Set(parts.map((part) => part.concept).filter((concept): concept is string => !!concept))];
  return { summary, parts, concepts };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

export function findCodeLine(fileContent: string | undefined, code: string | undefined, fromLine = 1): number | undefined {
  if (!fileContent || !code) return undefined;
  const quoted = code.split("\n").map(normalize).find(Boolean);
  if (!quoted) return undefined;

  const targets = [quoted];
  const beforeEllipsis = quoted.split(/\.\.\.|…/)[0].trim();
  if (beforeEllipsis !== quoted && beforeEllipsis.length >= 8) targets.push(beforeEllipsis);

  const lines = fileContent.split("\n").map(normalize);
  const start = Math.min(Math.max(fromLine, 1), lines.length) - 1;
  for (const target of targets) {
    for (let i = start; i < lines.length; i++) if (lines[i].includes(target)) return i + 1;
    for (let i = 0; i < start; i++) if (lines[i].includes(target)) return i + 1;
  }
  return undefined;
}

export function withLines(lesson: Lesson, fileContent: string | undefined): Lesson {
  if (!fileContent || lesson.parts.length === 0) return lesson;
  let from = 1;
  const parts = lesson.parts.map((part) => {
    const line = findCodeLine(fileContent, part.code, from);
    if (line) from = line;
    return line ? { ...part, line } : part;
  });
  return { ...lesson, parts };
}

export interface WalkthroughNote {
  startLine: number;
  endLine: number;
  title: string;
  text: string;
  isComplete: boolean;
}

export interface Walkthrough {
  overview: string;
  notes: WalkthroughNote[];
  closing?: { title: string; text: string };
}

const NOTE_HEADING = /^###[ \t]+L(\d+)(?:[ \t]*[-–—][ \t]*L?(\d+))?[ \t]*[·•|:–—-][ \t]*(\S.*?)[ \t]*$/;
const ANY_HEADING = /^###[ \t]+(\S.*?)[ \t]*$/;

export function parseWalkthrough(raw: string, isComplete: boolean): Walkthrough {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (!isComplete && lines.length > 0 && /^#/.test(lines[lines.length - 1])) lines.pop();

  const overview: string[] = [];
  const headings: Omit<WalkthroughNote, "text" | "isComplete">[] = [];
  const bodies: string[][] = [];
  let closing: { title: string; body: string[] } | undefined;
  let body = overview;

  for (const line of lines) {
    const note = NOTE_HEADING.exec(line);
    if (note) {
      const first = Number(note[1]);
      const last = note[2] ? Number(note[2]) : first;
      body = [];
      bodies.push(body);
      headings.push({
        startLine: Math.min(first, last),
        endLine: Math.max(first, last),
        title: cleanText(note[3].replace(/\*\*/g, "")),
      });
      closing = undefined;
      continue;
    }
    const other = ANY_HEADING.exec(line);
    if (other) {
      body = [];
      closing = { title: cleanText(other[1].replace(/\*\*/g, "")), body };
      continue;
    }
    body.push(line);
  }

  const joined = (parts: string[]) => cleanText(parts.join("\n").replace(/\n{3,}/g, "\n\n"));
  const notes = headings.map((heading, index) => ({
    ...heading,
    text: joined(bodies[index]),
    isComplete: isComplete || closing !== undefined || index < headings.length - 1,
  }));

  return {
    overview: joined(overview),
    notes,
    ...(closing ? { closing: { title: closing.title, text: joined(closing.body) } } : {}),
  };
}

export function linesOf(fileContent: string | undefined, startLine: number, endLine: number): string[] {
  if (!fileContent) return [];
  const lines = fileContent.replace(/\n$/, "").split("\n");
  if (startLine < 1 || startLine > lines.length) return [];
  return lines.slice(startLine - 1, Math.min(endLine, lines.length));
}
