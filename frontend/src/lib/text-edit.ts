/**
 * Turning words a person changed by hand in the preview into a change to the project's source, with no model.
 *
 * Handles: reading the edit the page posted; finding which files may hold the old words - the files React said the
 * text was written in, and those the project's search finds a piece of the words in; parsing each file and finding
 * the words inside its text and string nodes; choosing the one the person meant, or saying that none or several
 * could be; writing the new words in, escaped for the node they land in; and saving the file by hand, as the Code
 * tab's editor does, once more against the newer file if it changed underneath.
 *
 * The only thing ever changed is the inside of a JSX text node, a JSX attribute's string, a string literal or a
 * template's literal part - found by a real parser (@lezer/javascript, through @codemirror/lang-javascript), never by
 * matching raw source - and what goes in is escaped for that node: a brace or an angle bracket in JSX text becomes
 * an entity, a quote in a string gains a backslash. So the edit can change what the app says and never what it does,
 * however the words were chosen. That matters because the edit is the page's claim, and the page is code an AI
 * wrote: a string that names a module, an address or a class is left alone even when its words match.
 *
 * Words are compared as the browser shows them. JSX folds a line break and its indent into one space and decodes
 * entities, and a string decodes its escapes, so each node's text is decoded first, with every character remembering
 * where in the source it came from, and runs of white space are compared as one space. Whatever white space
 * surrounded the old words in their node stays where it was.
 *
 * Words the app works out - a count, a name from its data, a template with a value in the middle - are in no single
 * node as shown, and are reported as not found rather than guessed at. When the same words are in several places,
 * the place nearest the line React gave wins only when it is clearly nearest; otherwise the person is told to use
 * the Code tab.
 */
import { jsxLanguage, tsxLanguage, typescriptLanguage } from "@codemirror/lang-javascript";

type SyntaxNode = ReturnType<typeof tsxLanguage.parser.parse>["topNode"];

export interface TextEditHint {
  file: string;
  line: number;
}

export interface TextEdit {
  id: number;
  before: string;
  after: string;
  hints: TextEditHint[];
}

export type TextNodeKind = "jsx-text" | "jsx-attribute" | "string" | "template";

export interface TextSpot {
  path: string;
  from: number;
  to: number;
  line: number;
  kind: TextNodeKind;
  quote: string;
}

export type TextEditOutcome =
  | { kind: "saved"; path: string }
  | { kind: "unchanged" }
  | { kind: "not-found" }
  | { kind: "ambiguous"; count: number }
  | { kind: "changed-underneath" };

export interface TextEditIo {
  listPaths: () => Promise<string[]>;
  search: (fragment: string) => Promise<string[]>;
  readFile: (path: string) => Promise<{ content: string; hash: string | null }>;
  saveFile: (path: string, content: string, baseHash: string) => Promise<void>;
  isConflict: (error: unknown) => boolean;
}

export const MAX_EDIT_CHARS = 2_000;
const MAX_HINTS = 12;
const MAX_CANDIDATE_FILES = 30;
const SOURCE_FILE = /\.(tsx|jsx|ts|js|mjs|cjs)$/;
const NOT_TEXT_ATTRIBUTES = /^(href|src|srcSet|action|formAction|to|className|class|style|id|key|ref|type|rel|target|role|name|htmlFor|method|encType|lang|dir|as|on[A-Z].*|data-.*|aria-.*)$/;
const SEARCHABLE = /[A-Za-z0-9.,:;!?()\-_/#%+=*@$~^|[\]]+/g;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0", copy: "\u00a9", reg: "\u00ae", trade: "\u2122",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", rarr: "\u2192", larr: "\u2190", middot: "\u00b7", bull: "\u2022",
  laquo: "\u00ab", raquo: "\u00bb", times: "\u00d7", deg: "\u00b0", euro: "\u20ac", pound: "\u00a3",
};
const SIMPLE_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };

/** The edit the page posted, or null when it is not one. Nothing about its shape is trusted. */
export function readTextEdit(payload: unknown): TextEdit | null {
  if (!payload || typeof payload !== "object") return null;
  const { id, before, after, hints } = payload as Record<string, unknown>;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  if (typeof before !== "string" || typeof after !== "string") return null;
  if (before.length > MAX_EDIT_CHARS || after.length > MAX_EDIT_CHARS) return null;
  const read: TextEditHint[] = [];
  if (Array.isArray(hints)) {
    for (const hint of hints.slice(0, MAX_HINTS)) {
      const { file, line } = (hint ?? {}) as Record<string, unknown>;
      if (typeof file === "string" && file.length <= 500 && typeof line === "number" && Number.isInteger(line) && line > 0) {
        read.push({ file, line });
      }
    }
  }
  return { id, before, after, hints: read };
}

/** Words as the browser shows them, for comparing: one space for any run of white space, none at the ends. */
export const normalizeWords = (text: string): string => text.replace(/[\s\u00a0]+/g, " ").trim();

/** The longest piece of the words that is written the same way in any kind of node, to search the project for. */
export function searchFragment(words: string): string | null {
  const pieces: string[] = words.match(SEARCHABLE) ?? [];
  const longest = pieces.reduce((best, piece) => (piece.length > best.length ? piece : best), "");
  return longest.length >= 2 ? longest : null;
}

/** The project file a source hint names: the longest project path the hint's file name ends with. */
export function hintedPath(fileName: string, projectPaths: readonly string[]): string | null {
  const name = fileName.split("\\").join("/").split("?")[0];
  let best: string | null = null;
  for (const path of projectPaths) {
    if ((name === path || name.endsWith(`/${path}`)) && (!best || path.length > best.length)) best = path;
  }
  return best;
}

interface Unit {
  ch: string;
  from: number;
  to: number;
}

function decodeEntities(source: string, from: number, to: number): Unit[] {
  const units: Unit[] = [];
  let i = from;
  while (i < to) {
    if (source[i] === "&") {
      const end = source.indexOf(";", i);
      if (end > i && end < to && end - i <= 10) {
        const name = source.slice(i + 1, end);
        let value: string | undefined;
        if (/^#\d+$/.test(name)) value = String.fromCodePoint(Number(name.slice(1)));
        else if (/^#x[0-9a-f]+$/i.test(name)) value = String.fromCodePoint(parseInt(name.slice(2), 16));
        else value = ENTITIES[name];
        if (value !== undefined) {
          units.push({ ch: value, from: i, to: end + 1 });
          i = end + 1;
          continue;
        }
      }
    }
    units.push({ ch: source[i], from: i, to: i + 1 });
    i += 1;
  }
  return units;
}

function decodeEscapes(source: string, from: number, to: number): Unit[] {
  const units: Unit[] = [];
  let i = from;
  while (i < to) {
    if (source[i] !== "\\" || i + 1 >= to) {
      units.push({ ch: source[i], from: i, to: i + 1 });
      i += 1;
      continue;
    }
    const next = source[i + 1];
    let length = 2;
    let value: string;
    if (next === "u" && source[i + 2] === "{") {
      const close = source.indexOf("}", i);
      length = close > i && close < to ? close - i + 1 : 2;
      value = length > 2 ? String.fromCodePoint(parseInt(source.slice(i + 3, close), 16) || 0) : "u";
    } else if (next === "u" && /^[0-9a-f]{4}$/i.test(source.slice(i + 2, i + 6))) {
      length = 6;
      value = String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16));
    } else if (next === "x" && /^[0-9a-f]{2}$/i.test(source.slice(i + 2, i + 4))) {
      length = 4;
      value = String.fromCharCode(parseInt(source.slice(i + 2, i + 4), 16));
    } else if (next === "\r" || next === "\n") {
      length = next === "\r" && source[i + 2] === "\n" ? 3 : 2;
      value = "";
    } else {
      value = SIMPLE_ESCAPES[next] ?? next;
    }
    if (value) units.push({ ch: value, from: i, to: i + length });
    i += length;
  }
  return units;
}

function parserFor(path: string) {
  if (path.endsWith(".tsx")) return tsxLanguage.parser;
  if (path.endsWith(".ts")) return typescriptLanguage.parser;
  return jsxLanguage.parser;
}

function isCodeString(node: SyntaxNode, source: string): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.name === "ImportDeclaration" || parent.name === "ExportDeclaration") return true;
  if (parent.name === "Property" && parent.firstChild?.from === node.from) return true;
  if (parent.name === "ArgList" && parent.parent?.name === "CallExpression") {
    const callee = parent.parent.firstChild;
    const name = callee ? source.slice(callee.from, callee.to) : "";
    return /^(import|require|fetch)$/.test(name) || /\.(querySelector|querySelectorAll|getElementById|addEventListener|getItem|setItem|removeItem)$/.test(name);
  }
  return false;
}

function attributeName(node: SyntaxNode, source: string): string {
  const attribute = node.parent;
  const name = attribute?.firstChild;
  return attribute?.name === "JSXAttribute" && name ? source.slice(name.from, name.to) : "";
}

interface Piece {
  kind: TextNodeKind;
  quote: string;
  units: Unit[];
}

function textPieces(path: string, source: string): Piece[] {
  const pieces: Piece[] = [];
  const tree = parserFor(path).parse(source);
  tree.iterate({
    enter: (ref) => {
      const { name, from, to } = ref;
      if (name === "JSXText") {
        pieces.push({ kind: "jsx-text", quote: "", units: decodeEntities(source, from, to) });
      } else if (name === "JSXAttributeValue") {
        const quote = source[from];
        if ((quote === "\"" || quote === "'") && to - from >= 2 && !NOT_TEXT_ATTRIBUTES.test(attributeName(ref.node, source))) {
          pieces.push({ kind: "jsx-attribute", quote, units: decodeEntities(source, from + 1, to - 1) });
        }
      } else if (name === "String") {
        const quote = source[from];
        if ((quote === "\"" || quote === "'") && to - from >= 2 && source[to - 1] === quote && !isCodeString(ref.node, source)) {
          pieces.push({ kind: "string", quote, units: decodeEscapes(source, from + 1, to - 1) });
        }
      } else if (name === "TemplateString") {
        if (!isCodeString(ref.node, source) && source[to - 1] === "`") {
          let start = from + 1;
          for (let child = ref.node.firstChild; child; child = child.nextSibling) {
            if (child.name !== "Interpolation") continue;
            pieces.push({ kind: "template", quote: "`", units: decodeEscapes(source, start, child.from) });
            start = child.to;
          }
          pieces.push({ kind: "template", quote: "`", units: decodeEscapes(source, start, to - 1) });
        }
        return false;
      }
      return undefined;
    },
  });
  return pieces;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (source.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Every place in one file where the words are written inside a text or string node. */
export function findTextSpots(path: string, source: string, words: string): TextSpot[] {
  const target = normalizeWords(words);
  if (!target) return [];
  const spots: TextSpot[] = [];
  for (const piece of textPieces(path, source)) {
    const folded: Unit[] = [];
    for (const unit of piece.units) {
      const isSpace = /[\s\u00a0]/.test(unit.ch);
      const last = folded[folded.length - 1];
      if (isSpace && last?.ch === " ") last.to = unit.to;
      else folded.push({ ch: isSpace ? " " : unit.ch, from: unit.from, to: unit.to });
    }
    const owner: number[] = [];
    let text = "";
    folded.forEach((unit, index) => {
      text += unit.ch;
      for (let i = 0; i < unit.ch.length; i += 1) owner.push(index);
    });
    for (let at = text.indexOf(target); at !== -1; at = text.indexOf(target, at + 1)) {
      const first = folded[owner[at]];
      const last = folded[owner[at + target.length - 1]];
      spots.push({ path, from: first.from, to: last.to, line: lineAt(source, first.from), kind: piece.kind, quote: piece.quote });
    }
  }
  return spots;
}

/** New words written for the node they land in, so that they can only ever be words there. */
export function escapeFor(words: string, kind: TextNodeKind, quote: string): string {
  const entityLike = /&(?=#?[A-Za-z0-9]+;)/g;
  switch (kind) {
    case "jsx-text":
      return words.replace(entityLike, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
    case "jsx-attribute":
      return words.replace(entityLike, "&amp;").replace(quote === "'" ? /'/g : /"/g, quote === "'" ? "&apos;" : "&quot;");
    case "string":
      return words.replace(/\\/g, "\\\\").replace(quote === "'" ? /'/g : /"/g, `\\${quote}`).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    case "template":
      return words.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  }
}

/**
 * The place the person meant among every place the words are written, given where React said they were made.
 * A hinted file's places are ranked by their distance from its hinted lines - at or after a line before above it,
 * since an element's words follow its opening tag - and the nearest wins only when nothing else is as near.
 */
export function chooseSpot(spots: readonly TextSpot[], hints: readonly { path: string; line: number }[]):
  { spot: TextSpot } | { ambiguous: number } | null {
  if (spots.length === 0) return null;
  const seen = new Set<string>();
  for (const hint of hints) {
    if (seen.has(hint.path)) continue;
    seen.add(hint.path);
    const inFile = spots.filter((spot) => spot.path === hint.path);
    if (inFile.length === 0) continue;
    if (inFile.length === 1) return { spot: inFile[0] };
    const lines = hints.filter((other) => other.path === hint.path).map((other) => other.line);
    const distance = (spot: TextSpot) =>
      Math.min(...lines.map((line) => (spot.line >= line ? spot.line - line : 10_000 + line - spot.line)));
    const ranked = [...inFile].sort((a, b) => distance(a) - distance(b));
    if (distance(ranked[0]) < distance(ranked[1])) return { spot: ranked[0] };
    return { ambiguous: inFile.length };
  }
  return spots.length === 1 ? { spot: spots[0] } : { ambiguous: spots.length };
}

/** The file's text with the words at the spot replaced. */
export function rewrite(source: string, spot: TextSpot, words: string): string {
  return source.slice(0, spot.from) + escapeFor(words, spot.kind, spot.quote) + source.slice(spot.to);
}

async function attempt(edit: TextEdit, before: string, after: string, io: TextEditIo): Promise<TextEditOutcome> {
  const projectPaths = await io.listPaths();
  const hints = edit.hints.flatMap((hint) => {
    const path = hintedPath(hint.file, projectPaths);
    return path && SOURCE_FILE.test(path) ? [{ path, line: hint.line }] : [];
  });
  const fragment = searchFragment(before);
  const found = fragment ? await io.search(fragment) : [];
  const candidates = [...new Set([...hints.map((hint) => hint.path), ...found])]
    .filter((path) => SOURCE_FILE.test(path) && projectPaths.includes(path))
    .slice(0, MAX_CANDIDATE_FILES);

  const files = new Map<string, { content: string; hash: string | null }>();
  await Promise.all(candidates.map(async (path) => files.set(path, await io.readFile(path))));
  const spots = candidates.flatMap((path) => findTextSpots(path, files.get(path)!.content, before));
  const choice = chooseSpot(spots, hints);
  if (!choice) return { kind: "not-found" };
  if ("ambiguous" in choice) return { kind: "ambiguous", count: choice.ambiguous };

  const file = files.get(choice.spot.path)!;
  if (file.hash === null) return { kind: "not-found" };
  await io.saveFile(choice.spot.path, rewrite(file.content, choice.spot, after), file.hash);
  return { kind: "saved", path: choice.spot.path };
}

/** Finds the words the person changed and saves the file they are in, trying once more if it changed underneath. */
export async function saveTextEdit(edit: TextEdit, io: TextEditIo): Promise<TextEditOutcome> {
  const before = normalizeWords(edit.before);
  const after = edit.after.replace(/[\r\n]+/g, " ").trim();
  if (!before || !after) return { kind: "not-found" };
  if (before === normalizeWords(after)) return { kind: "unchanged" };
  try {
    return await attempt(edit, before, after, io);
  } catch (error) {
    if (!io.isConflict(error)) throw error;
  }
  try {
    return await attempt(edit, before, after, io);
  } catch (error) {
    if (io.isConflict(error)) return { kind: "changed-underneath" };
    throw error;
  }
}

/** What to tell the person when the words could not be saved. */
export function textEditProblem(outcome: TextEditOutcome): { title: string; description: string } | null {
  switch (outcome.kind) {
    case "not-found":
      return {
        title: "Couldn't find these words in the code",
        description: "They may be worked out by the app or come from its data. Change them in the Code tab, or ask in the chat.",
      };
    case "ambiguous":
      return {
        title: `These words are in ${outcome.count} places`,
        description: "To be sure the right one changes, edit it in the Code tab.",
      };
    case "changed-underneath":
      return {
        title: "The file changed while you were editing",
        description: "Someone else, or the AI, saved a newer version. Try the change again.",
      };
    default:
      return null;
  }
}
