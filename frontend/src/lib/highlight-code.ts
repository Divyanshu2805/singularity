import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { jsonLanguage } from "@codemirror/lang-json";
import { cssLanguage } from "@codemirror/lang-css";
import { jsxLanguage, tsxLanguage } from "@codemirror/lang-javascript";
import type { Language } from "@codemirror/language";

/**
 * Syntax highlighting for code blocks in chat, using the same Lezer parsers the editor runs and the same
 * palette (`--syntax-*`), so a snippet in a reply looks exactly like the same code in the editor beside it.
 *
 * <p>Deliberately no highlighting library: the parsers are already here for the editor, and a second one
 * would mean a second theme to keep in step with this one.
 */

/** Maps syntax tags to class names; the colours live in `index.css` next to the rest of the theme. */
const highlighter = tagHighlighter([
  { tag: t.comment, class: "tok-comment" },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], class: "tok-keyword" },
  { tag: [t.string, t.special(t.string)], class: "tok-string" },
  { tag: [t.number, t.bool, t.null], class: "tok-number" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: "tok-function" },
  { tag: t.propertyName, class: "tok-function" },
  { tag: [t.typeName, t.className, t.namespace], class: "tok-type" },
  { tag: t.operator, class: "tok-keyword" },
  { tag: t.punctuation, class: "tok-punctuation" },
  { tag: t.tagName, class: "tok-type" },
  { tag: t.attributeName, class: "tok-number" },
  { tag: t.angleBracket, class: "tok-punctuation" },
  { tag: t.meta, class: "tok-comment" },
]);

/** One highlighted run of code: `cls` is empty for text that carries no syntax tag. */
export interface CodeToken {
  text: string;
  cls: string;
}

const LANGUAGES: Record<string, Language> = {
  js: jsxLanguage,
  jsx: jsxLanguage,
  mjs: jsxLanguage,
  ts: tsxLanguage,
  tsx: tsxLanguage,
  typescript: tsxLanguage,
  javascript: jsxLanguage,
  json: jsonLanguage,
  css: cssLanguage,
  scss: cssLanguage,
  html: jsxLanguage,
};

/** Resolves a fence's language hint, or a file path's extension, to a parser. */
export function languageFor(hint: string | undefined): Language | null {
  if (!hint) return null;
  const key = hint.includes(".") ? (hint.split(".").pop() ?? "") : hint;
  return LANGUAGES[key.toLowerCase()] ?? null;
}

/**
 * Splits code into styled runs. Returns a single untagged run when the language isn't one we parse, so
 * callers can render the result the same way either way.
 *
 * <p>Long inputs are left unhighlighted rather than parsed: a whole generated file pasted into a reply would
 * cost more to tokenise than the colour is worth, and it happens on every render of that message.
 */
export const MAX_HIGHLIGHT_CHARS = 20000;

export function highlightCode(code: string, hint: string | undefined): CodeToken[] {
  const language = languageFor(hint);
  if (!language || code.length > MAX_HIGHLIGHT_CHARS) {
    return [{ text: code, cls: "" }];
  }

  const tokens: CodeToken[] = [];
  let position = 0;

  try {
    const tree = language.parser.parse(code);
    highlightTree(tree, highlighter, (from, to, cls) => {
      // Everything between the last token and this one carries no tag - plain text, but still code.
      if (from > position) tokens.push({ text: code.slice(position, from), cls: "" });
      tokens.push({ text: code.slice(from, to), cls });
      position = to;
    });
  } catch {
    // A snippet mid-stream is often not valid syntax yet; showing it unhighlighted beats showing nothing.
    return [{ text: code, cls: "" }];
  }

  if (position < code.length) tokens.push({ text: code.slice(position), cls: "" });
  return tokens;
}
