/**
 * Covers turning a preview error into a fix request.
 *
 * Handles: the plain sentence for each common kind of error and for one nobody anticipated; finding the project file
 * an address points at and refusing one that is not the project's; the request itself - that it asks for the
 * smallest change, names the place, and leaves library frames out of the stack; and the cap that stops one error
 * being sent for a fix for ever, including that the same fault on a different line is still the same error; and a
 * page that loaded and drew nothing, which has its own sentence and its own request.
 */
import { describe, expect, it } from "vitest";
import {
  BLANK_PAGE_SOURCE,
  MAX_FIX_ATTEMPTS,
  blankPageError,
  isBlankPage,
  errorPlace,
  errorSignature,
  fixOffer,
  fixRequestFor,
  plainWords,
  projectFileOf,
  withFixAttempt,
  type RuntimeError,
} from "./preview-fix";

const error = (overrides: Partial<RuntimeError> = {}): RuntimeError => ({
  message: "Uncaught ReferenceError: useTasks is not defined",
  filename: "http://p-abc.localhost:8090/src/pages/Index.tsx?t=1728300000000",
  lineno: 12,
  colno: 21,
  stack: [
    "ReferenceError: useTasks is not defined",
    "    at Index (http://p-abc.localhost:8090/src/pages/Index.tsx?t=1728300000000:12:21)",
    "    at renderWithHooks (http://p-abc.localhost:8090/node_modules/.vite/deps/chunk-ABC.js?v=1:11548:26)",
  ].join("\n"),
  ...overrides,
});

describe("plainWords", () => {
  it.each([
    ["Uncaught ReferenceError: useTasks is not defined", 'uses "useTasks"'],
    ["Cannot read properties of undefined (reading 'map')", 'looked for "map"'],
    ["TypeError: items.forEach is not a function", 'run "items.forEach"'],
    ['[plugin:vite:import-analysis] Failed to resolve import "framer-motion" from "src/App.tsx"', 'load "framer-motion"'],
    ["The requested module '/src/lib/notes.ts' does not provide an export named 'loadNotes'", 'for "loadNotes"'],
    ["Maximum update depth exceeded. This can happen when a component repeatedly calls setState", "in a loop"],
    ["Rendered more hooks than during the previous render.", "built-in helpers"],
    ["Objects are not valid as a React child (found: object with keys {id, text})", "whole bundle of data"],
    ["Unexpected token (14:6)", "typing mistake"],
    ["TypeError: Failed to fetch", "over the network"],
  ])("explains %s", (message, expected) => {
    expect(plainWords(error({ message }))).toContain(expected);
  });

  it("still says something true about an error it does not recognise", () => {
    expect(plainWords(error({ message: "Quux overflow in sector 7" }))).toBe(
      "Something in the app's code failed while it was running."
    );
  });
});

describe("projectFileOf", () => {
  it("reads the project path out of the preview's address, without the cache-busting query", () => {
    expect(projectFileOf("http://p-abc.localhost:8090/src/pages/Index.tsx?t=1728300000000")).toBe("src/pages/Index.tsx");
    expect(projectFileOf("/src/lib/it%27s.ts")).toBe("src/lib/it's.ts");
  });

  it("does not name a library file or something that is not a file", () => {
    expect(projectFileOf("http://p-abc.localhost:8090/node_modules/.vite/deps/react.js?v=1")).toBeNull();
    expect(projectFileOf("http://p-abc.localhost:8090/@vite/client")).toBeNull();
    expect(projectFileOf("http://p-abc.localhost:8090/")).toBeNull();
    expect(projectFileOf(undefined)).toBeNull();
  });
});

describe("fixRequestFor", () => {
  it("asks for the smallest change and names the error and where it is", () => {
    const request = fixRequestFor(error());

    expect(request).toContain("Fix it with the smallest change that works, and change nothing else.");
    expect(request).toContain("Error: Uncaught ReferenceError: useTasks is not defined");
    expect(request).toContain("Where: src/pages/Index.tsx, line 12");
  });

  it("keeps the project's own frames of the stack and drops the library's", () => {
    const request = fixRequestFor(error());

    expect(request).toContain("at Index (");
    expect(request).not.toContain("node_modules");
  });

  it("leaves out the place when the error does not point at a project file", () => {
    const request = fixRequestFor(error({ filename: undefined, stack: undefined }));

    expect(request).not.toContain("Where:");
    expect(request).not.toContain("Stack:");
  });

  it("stays short however long the error is", () => {
    const request = fixRequestFor(error({ message: "x".repeat(20_000), stack: "at y\n".repeat(500) }));

    expect(request.length).toBeLessThan(2_500);
  });

  it("names the place without a line when there is none", () => {
    expect(errorPlace(error({ lineno: 0 }))).toBe("src/pages/Index.tsx");
  });
});

describe("the cap on fix attempts", () => {
  it("offers a fix for a new error and stops after the limit", () => {
    let attempts: Map<string, number> = new Map();
    expect(fixOffer(attempts, error())).toBe("offer");

    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
      expect(fixOffer(attempts, error())).toBe("offer");
      attempts = withFixAttempt(attempts, error());
    }

    expect(fixOffer(attempts, error())).toBe("exhausted");
  });

  it("treats the same fault on another line, or after a reload, as the same error", () => {
    const moved = error({
      lineno: 19,
      filename: "http://p-abc.localhost:8090/src/pages/Index.tsx?t=1728399999999",
    });

    expect(errorSignature(moved)).toBe(errorSignature(error()));
  });

  it("does not let one error use up another's attempts", () => {
    let attempts: Map<string, number> = new Map();
    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) attempts = withFixAttempt(attempts, error());

    expect(fixOffer(attempts, error({ message: "TypeError: items.map is not a function" }))).toBe("offer");
    expect(fixOffer(attempts, error({ filename: "http://p-abc.localhost:8090/src/App.tsx" }))).toBe("offer");
  });
});

describe("a page that loaded and drew nothing", () => {
  it("is an error of its own kind", () => {
    expect(blankPageError().source).toBe(BLANK_PAGE_SOURCE);
    expect(isBlankPage(blankPageError())).toBe(true);
    expect(isBlankPage(error())).toBe(false);
    expect(isBlankPage(null)).toBe(false);
  });

  it("is said in plain words that do not read like a crash", () => {
    expect(plainWords(blankPageError())).toMatch(/^The app started, but the page is empty\./);
  });

  it("asks for what is known - the app starts and nothing appears - and still for the smallest change", () => {
    const request = fixRequestFor(blankPageError());

    expect(request).toContain("the page is blank");
    expect(request).toContain("src/main.tsx");
    expect(request).toContain("smallest change that works");
    expect(request).not.toContain("Error:");
  });

  it("is capped like any other error", () => {
    let attempts: Map<string, number> = new Map();
    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) attempts = withFixAttempt(attempts, blankPageError());

    expect(fixOffer(attempts, blankPageError())).toBe("exhausted");
    expect(fixOffer(attempts, error())).toBe("offer");
  });
});
