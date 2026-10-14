/**
 * Covers lib/text-edit.ts: words changed by hand in the preview becoming a change to the project's source.
 *
 * Handles: an edit from the page read only when every field is the type it must be; JSX text found across a line
 * break and through an entity, and its surrounding white space kept; a string, a template's literal part and a
 * component's text prop found; words in code, an import, a class name, an address or a key never found; new words
 * escaped for the node they land in so they cannot become code; the place nearest React's hint chosen, and several
 * places with no clear winner refused; a hint's file name matched to a project path; and the whole save - searching,
 * reading, writing with the file's hash, trying again once after a conflict, and saying what went wrong.
 */
import { describe, expect, it, vi } from "vitest";
import {
  chooseSpot,
  escapeFor,
  findTextSpots,
  hintedPath,
  readTextEdit,
  rewrite,
  saveTextEdit,
  searchFragment,
  textEditProblem,
  type TextEditIo,
  type TextSpot,
} from "./text-edit";

const PAGE = `import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

const features = [
  { title: "Fast builds", body: 'Ship in minutes, don\\'t wait' },
  { title: \`Live \${"preview"} for you\`, body: "Tom &amp; Jerry" },
];

export default function Index() {
  const go = () => fetch("/api/notes");
  return (
    <main className="min-h-screen p-8">
      <h1 title="Welcome">
        Build your
          next app &amp; more
      </h1>
      <p>{features.length} items left</p>
      <Feature heading="Made for teams" href="/teams" />
      <Button onClick={go}><Zap /> Save changes</Button>
      <Button>Save changes</Button>
    </main>
  );
}
`;

const edit = (source: string, path: string, before: string, after: string) => {
  const spots = findTextSpots(path, source, before);
  expect(spots).toHaveLength(1);
  return rewrite(source, spots[0], after);
};

describe("reading the page's edit", () => {
  it("takes an edit whose every field is the right type, and keeps only well-formed hints", () => {
    expect(readTextEdit({ id: 3, before: "a", after: "b", hints: [{ file: "/app/src/x.tsx", line: 4 }, { file: 1 }, { file: "y", line: -1 }] }))
      .toEqual({ id: 3, before: "a", after: "b", hints: [{ file: "/app/src/x.tsx", line: 4 }] });
    expect(readTextEdit({ id: 3, before: "a", after: "b" })).toEqual({ id: 3, before: "a", after: "b", hints: [] });
  });

  it("drops anything else", () => {
    expect(readTextEdit(null)).toBeNull();
    expect(readTextEdit({ id: "3", before: "a", after: "b" })).toBeNull();
    expect(readTextEdit({ id: 1.5, before: "a", after: "b" })).toBeNull();
    expect(readTextEdit({ id: 3, before: 1, after: "b" })).toBeNull();
    expect(readTextEdit({ id: 3, before: "a", after: "x".repeat(2001) })).toBeNull();
  });
});

describe("finding the words", () => {
  it("finds JSX text across a line break and through an entity, and keeps the white space around it", () => {
    const next = edit(PAGE, "src/pages/Index.tsx", "Build your next app & more", "Build anything");
    expect(next).toContain("<h1 title=\"Welcome\">\n        Build anything\n      </h1>");
  });

  it("finds the words beside an expression and leaves the expression alone", () => {
    expect(edit(PAGE, "src/pages/Index.tsx", " items left", "things to do")).toContain("<p>{features.length} things to do</p>");
  });

  it("finds a string, through its escapes, and a template's literal part", () => {
    expect(edit(PAGE, "src/pages/Index.tsx", "Fast builds", "Quick builds")).toContain("title: \"Quick builds\"");
    expect(edit(PAGE, "src/pages/Index.tsx", "Ship in minutes, don't wait", "No waiting")).toContain("body: 'No waiting'");
    expect(edit(PAGE, "src/pages/Index.tsx", "for you", "for everyone")).toContain("`Live ${\"preview\"} for everyone`");
  });

  it("finds a component's text prop", () => {
    expect(edit(PAGE, "src/pages/Index.tsx", "Made for teams", "Made for you")).toContain("heading=\"Made for you\"");
  });

  it("never finds words in code, an import, a class name, an address, a key or a value worked out", () => {
    for (const words of ["Button", "lucide-react", "min-h-screen", "/api/notes", "/teams", "title", "Live preview for you", "3 items left"]) {
      expect(findTextSpots("src/pages/Index.tsx", PAGE, words)).toEqual([]);
    }
  });

  it("reads plain JavaScript with JSX and TypeScript without it", () => {
    expect(findTextSpots("src/App.jsx", "export const A = () => <p>Hi there</p>;", "Hi there")).toHaveLength(1);
    expect(findTextSpots("src/lib/copy.ts", "export const title: string = 'Hi there';", "Hi there")).toHaveLength(1);
  });

  it("finds every place the same words are written", () => {
    const spots = findTextSpots("src/pages/Index.tsx", PAGE, "Save changes");
    expect(spots.map((spot) => spot.line)).toEqual([19, 20]);
  });
});

describe("writing the new words", () => {
  it("cannot turn JSX text into code", () => {
    expect(escapeFor("a {b} <c> &amp; & d", "jsx-text", "")).toBe("a &#123;b&#125; &lt;c&gt; &amp;amp; & d");
  });

  it("cannot end a string or a template early", () => {
    expect(escapeFor(`it's "x" \\`, "string", "'")).toBe(`it\\'s "x" \\\\`);
    expect(escapeFor(`say "hi"`, "string", "\"")).toBe(`say \\"hi\\"`);
    expect(escapeFor("a ` ${b}", "template", "`")).toBe("a \\` \\${b}");
    expect(escapeFor(`a "b" 'c'`, "jsx-attribute", "\"")).toBe(`a &quot;b&quot; 'c'`);
  });

  it("writes a quote into a string so the file still means words", () => {
    const next = edit(PAGE, "src/pages/Index.tsx", "Fast builds", "Say \"go\"");
    expect(next).toContain("title: \"Say \\\"go\\\"\"");
  });
});

describe("choosing the place", () => {
  const spot = (path: string, line: number): TextSpot => ({ path, line, from: line, to: line + 1, kind: "jsx-text", quote: "" });

  it("takes the place nearest the line React gave, at or after it", () => {
    const spots = [spot("src/pages/Index.tsx", 19), spot("src/pages/Index.tsx", 20)];
    expect(chooseSpot(spots, [{ path: "src/pages/Index.tsx", line: 20 }])).toEqual({ spot: spots[1] });
    expect(chooseSpot(spots, [{ path: "src/pages/Index.tsx", line: 18 }])).toEqual({ spot: spots[0] });
  });

  it("looks in the hinted files in order, skipping one that does not hold the words", () => {
    const spots = [spot("src/pages/Index.tsx", 19), spot("src/pages/Other.tsx", 3)];
    expect(chooseSpot(spots, [{ path: "src/components/ui/button.tsx", line: 40 }, { path: "src/pages/Other.tsx", line: 1 }]))
      .toEqual({ spot: spots[1] });
  });

  it("refuses several places with no clear winner, and takes a lone place with no hint", () => {
    const spots = [spot("src/a.tsx", 5), spot("src/b.tsx", 5)];
    expect(chooseSpot(spots, [])).toEqual({ ambiguous: 2 });
    expect(chooseSpot([spots[0]], [])).toEqual({ spot: spots[0] });
    expect(chooseSpot([], [])).toBeNull();
  });

  it("matches a hint's file name to the longest project path it ends with", () => {
    const paths = ["src/pages/Index.tsx", "Index.tsx", "src/App.tsx"];
    expect(hintedPath("/app/src/pages/Index.tsx", paths)).toBe("src/pages/Index.tsx");
    expect(hintedPath("C:\\work\\src\\App.tsx", paths)).toBe("src/App.tsx");
    expect(hintedPath("/app/node_modules/x/index.js", paths)).toBeNull();
  });

  it("searches for the longest piece written the same way everywhere", () => {
    expect(searchFragment("Tom & Jerry's show")).toBe("Jerry");
    expect(searchFragment("& <")).toBeNull();
  });
});

describe("saving", () => {
  const io = (overrides: Partial<TextEditIo> = {}): TextEditIo & { saved: [string, string, string][] } => {
    const saved: [string, string, string][] = [];
    return {
      saved,
      listPaths: async () => ["src/pages/Index.tsx", "src/components/ui/button.tsx", "package.json"],
      search: async () => ["src/pages/Index.tsx", "package.json"],
      readFile: async (path) => ({ content: path === "src/pages/Index.tsx" ? PAGE : "export const x = 1;", hash: `hash-${path}` }),
      saveFile: async (path, content, hash) => {
        saved.push([path, content, hash]);
      },
      isConflict: (error) => error === "conflict",
      ...overrides,
    };
  };

  it("finds the words through React's hints and saves the file against the hash it read", async () => {
    const files = io();
    const outcome = await saveTextEdit(
      { id: 1, before: "Save changes", after: "Save all", hints: [{ file: "/app/src/components/ui/button.tsx", line: 40 }, { file: "/app/src/pages/Index.tsx", line: 20 }] },
      files
    );
    expect(outcome).toEqual({ kind: "saved", path: "src/pages/Index.tsx" });
    expect(files.saved).toHaveLength(1);
    expect(files.saved[0][1]).toContain("<Button>Save all</Button>");
    expect(files.saved[0][1]).toContain("<Zap /> Save changes</Button>");
    expect(files.saved[0][2]).toBe("hash-src/pages/Index.tsx");
  });

  it("says when the words are nowhere, in several places, or unchanged", async () => {
    expect(await saveTextEdit({ id: 1, before: "3 items left", after: "x", hints: [] }, io())).toEqual({ kind: "not-found" });
    expect(await saveTextEdit({ id: 1, before: "Save changes", after: "x", hints: [] }, io())).toEqual({ kind: "ambiguous", count: 2 });
    expect(await saveTextEdit({ id: 1, before: "Fast  builds", after: " Fast builds ", hints: [] }, io())).toEqual({ kind: "unchanged" });
    expect(await saveTextEdit({ id: 1, before: "Fast builds", after: "  ", hints: [] }, io())).toEqual({ kind: "not-found" });
  });

  it("tries once more against the newer file after a conflict, and then gives up", async () => {
    const once = vi.fn().mockRejectedValueOnce("conflict").mockResolvedValue(undefined);
    expect(await saveTextEdit({ id: 1, before: "Fast builds", after: "Quick", hints: [] }, io({ saveFile: once })))
      .toEqual({ kind: "saved", path: "src/pages/Index.tsx" });
    expect(once).toHaveBeenCalledTimes(2);

    const always = vi.fn().mockRejectedValue("conflict");
    expect(await saveTextEdit({ id: 1, before: "Fast builds", after: "Quick", hints: [] }, io({ saveFile: always })))
      .toEqual({ kind: "changed-underneath" });
  });

  it("lets any other failure through", async () => {
    await expect(saveTextEdit({ id: 1, before: "Fast builds", after: "Quick", hints: [] }, io({ saveFile: async () => { throw new Error("down"); } })))
      .rejects.toThrow("down");
  });

  it("has words for every way it can fail, and none for success", () => {
    expect(textEditProblem({ kind: "not-found" })?.title).toMatch(/Couldn't find/);
    expect(textEditProblem({ kind: "ambiguous", count: 3 })?.title).toBe("These words are in 3 places");
    expect(textEditProblem({ kind: "changed-underneath" })?.title).toMatch(/changed/);
    expect(textEditProblem({ kind: "saved", path: "x" })).toBeNull();
  });
});
