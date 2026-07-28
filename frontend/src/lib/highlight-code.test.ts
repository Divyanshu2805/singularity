/**
 * Covers syntax highlighting for chat code blocks: keywords, strings and comments coloured, the code reassembled
 * exactly including whitespace, a file path accepted as the language hint, an unknown language returned untouched,
 * code that is not valid yet still highlighted as it is mid-stream, and anything too large skipped rather than parsed
 * on every render.
 */
import { describe, it, expect } from "vitest";
import { highlightCode, languageFor, MAX_HIGHLIGHT_CHARS } from "./highlight-code";

const classOf = (code: string, hint: string | undefined, fragment: string) =>
  highlightCode(code, hint).find((token) => token.text === fragment)?.cls;

describe("highlightCode", () => {
  it("colours keywords, strings and comments in TypeScript", () => {
    const code = '// note\nconst greeting = "hello";';
    expect(classOf(code, "tsx", "const")).toBe("tok-keyword");
    expect(classOf(code, "tsx", '"hello"')).toBe("tok-string");
    expect(classOf(code, "tsx", "// note")).toBe("tok-comment");
  });

  it("puts the code back together exactly, including whitespace", () => {
    const code = 'function add(a: number) {\n  return a + 1;\n}\n';
    expect(highlightCode(code, "tsx").map((t) => t.text).join("")).toBe(code);
  });

  it("accepts a file path as the language hint, not just a fence label", () => {
    expect(classOf('const a = 1;', "src/App.tsx", "const")).toBe("tok-keyword");
    expect(languageFor("src/styles/App.css")).not.toBeNull();
    expect(languageFor("notes.txt")).toBeNull();
  });

  it("returns the code untouched for a language it doesn't parse", () => {
    const code = "SELECT * FROM users;";
    expect(highlightCode(code, "sql")).toEqual([{ text: code, cls: "" }]);
    expect(highlightCode(code, undefined)).toEqual([{ text: code, cls: "" }]);
  });

  it("still highlights code that isn't valid yet, as it is mid-stream", () => {
    const partial = 'const handleAdd = (title: string) => {\n  const id = addTask({ ti';
    const tokens = highlightCode(partial, "tsx");
    expect(tokens.map((t) => t.text).join("")).toBe(partial);
    expect(tokens.some((t) => t.cls === "tok-keyword")).toBe(true);
  });

  it("skips highlighting something too large to be worth parsing on every render", () => {
    const huge = "const a = 1;\n".repeat(MAX_HIGHLIGHT_CHARS);
    const tokens = highlightCode(huge, "tsx");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].cls).toBe("");
  });

  it("handles JSON and CSS too", () => {
    expect(classOf('{"a": 1}', "json", '"a"')).toBeTruthy();
    expect(classOf("body { color: red; }", "css", "body")).toBeTruthy();
  });

  it("returns an empty list for empty input rather than a blank token", () => {
    expect(highlightCode("", "tsx")).toEqual([]);
  });
});
