/**
 * Teaching mode walkthroughs: the `<learn>` body the AI writes after each file - a summary, then one part per important
 * piece of code, each anchored by a line quoted from the file.
 */

/** Where a chat reference points in a file. */
export interface CodeTarget {
  /** 1-based line the quoted code was found on in the file as the AI wrote it. */
  line?: number;
  /** Last line of a highlighted block, when the target is a range rather than a single line. */
  endLine?: number;
  /** The line as the AI quoted it - searched for again when opened, since the file may have changed since. */
  code?: string;
}

export interface LessonPart {
  code?: string;
  line?: number;
  text: string;
  /** Set when this part introduces a named idea, e.g. "State". */
  concept?: string;
}

export interface Lesson {
  summary: string;
  parts: LessonPart[];
  /** Concepts this lesson introduces - from its parts, or the single concept a one-sentence lesson carried. */
  concepts: string[];
}

// Each is lenient about a missing closer, both for a lesson still streaming and for a model that forgot one.
// `<related>` is no longer asked for or shown, but walkthroughs saved while it was still carry one - so it stays
// in the terminators and in STRAY_TAG, which is what keeps an old one from leaking into a summary as raw text.
const STRUCTURE = /<(summary|part|related)\b/i;
const SUMMARY = /<summary>([\s\S]*?)(?:<\/summary>|(?=<part\b|<related\b)|$)/i;
const PART = /<part\b([^>]*)>([\s\S]*?)(?:<\/part>|(?=<part\b|<related\b)|$)/gi;
const CODE = /<code>([\s\S]*?)(?:<\/code>|$)/i;
const STRAY_TAG = /<\/?(?:summary|part|code|related)\b[^>]*>|<\/?[a-z]*$/gi;

const readAttr = (attrs: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`, "i").exec(attrs)?.[1]?.trim() || undefined;

// Told not to escape, but a model writing inside tags treats them as XML: seen live as `&lt;number[]&gt;` and even
// `$&#123;lapNumber&#125;` for `${lapNumber}` - 7 of 73 quoted lines. `&amp;` goes last so `&amp;lt;` stays `&lt;`.
const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(lt|gt|quot|apos);/g, (_, name: string) => NAMED_ENTITIES[name])
    .replace(/&amp;/g, "&");

const cleanText = (text: string) => decodeEntities(text.replace(STRAY_TAG, "")).trim();

/**
 * A one-sentence lesson's concept is shown as its label, so a sentence that opens with it would read "Composition
 * Composition means...". While the text is still arriving and could yet turn out to be that name, it's held back
 * rather than flashing in and then vanishing.
 */
export function withoutLeadingConcept(text: string, concept: string | undefined, isComplete: boolean) {
  if (!concept) return text;
  const name = concept.toLowerCase();
  const lower = text.toLowerCase();
  if (!isComplete && name.startsWith(lower)) return "";
  if (!lower.startsWith(name) || /\w/.test(text.charAt(concept.length))) return text;
  return text.slice(concept.length).replace(/^[\s,:;.–—-]+/, "") || text;
}

/**
 * Reads a `<learn>` body. A body with none of the walkthrough's tags is a one-sentence lesson from before walkthroughs
 * existed (or a model that ignored the format) and becomes a summary, with `legacyConcept` - the concept those lessons
 * saved as metadata - as its only concept.
 */
export function parseLesson(content: string, legacyConcept?: string, isComplete = true): Lesson {
  if (!STRUCTURE.test(content)) {
    const concepts = legacyConcept ? [legacyConcept] : [];
    return { summary: withoutLeadingConcept(content.trim(), legacyConcept, isComplete), parts: [], concepts };
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

/**
 * The line a quoted piece of code is on. Parts walk through a file in order, so the search starts at `fromLine` and
 * only wraps to the top if nothing matches below it - which is what tells two identical `type="button"` lines apart.
 * Whitespace differences don't count, and a quote the model shortened with "..." is matched on the part before it.
 */
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

/** Fills in each part's line from the file the lesson is about, walking forward from the previous part's line. */
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
