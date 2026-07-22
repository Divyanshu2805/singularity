/**
 * Teaching-mode walkthroughs: the lesson body the AI writes after each file.
 *
 * Handles: parsing that body into a summary and one part per important piece of code, collecting the concepts it
 * introduces, and resolving each part's quoted line back to a line number in the file as it is now.
 *
 * The quoted line is searched for again when a lesson is opened rather than trusted as a stored line number, because
 * the file may have changed since the lesson was written.
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
  parts: LessonPart[];
  concepts: string[];
}

const STRUCTURE = /<(summary|part|related)\b/i;
const SUMMARY = /<summary>([\s\S]*?)(?:<\/summary>|(?=<part\b|<related\b)|$)/i;
const PART = /<part\b([^>]*)>([\s\S]*?)(?:<\/part>|(?=<part\b|<related\b)|$)/gi;
const CODE = /<code>([\s\S]*?)(?:<\/code>|$)/i;
const STRAY_TAG = /<\/?(?:summary|part|code|related)\b[^>]*>|<\/?[a-z]*$/gi;

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
