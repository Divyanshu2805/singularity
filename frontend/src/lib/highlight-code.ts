/**
 * Syntax highlighting for code blocks in chat.
 *
 * Handles: picking a language for a snippet, tokenising it and capping how much will be highlighted at all.
 *
 * It uses the same parsers the editor runs and the same palette, so a snippet in a reply looks exactly like the same
 * code in the editor beside it. Deliberately no highlighting library: the parsers are already here, and a second one
 * would mean a second theme to keep in step.
 */
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { jsonLanguage } from "@codemirror/lang-json";
import { cssLanguage } from "@codemirror/lang-css";
import { jsxLanguage, tsxLanguage } from "@codemirror/lang-javascript";
import type { Language } from "@codemirror/language";

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

export function languageFor(hint: string | undefined): Language | null {
  if (!hint) return null;
  const key = hint.includes(".") ? (hint.split(".").pop() ?? "") : hint;
  return LANGUAGES[key.toLowerCase()] ?? null;
}

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
      if (from > position) tokens.push({ text: code.slice(position, from), cls: "" });
      tokens.push({ text: code.slice(from, to), cls });
      position = to;
    });
  } catch {
    return [{ text: code, cls: "" }];
  }

  if (position < code.length) tokens.push({ text: code.slice(position), cls: "" });
  return tokens;
}
