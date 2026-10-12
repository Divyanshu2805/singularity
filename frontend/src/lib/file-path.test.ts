/**
 * Tests for lib/file-path: what a path typed for a new file is tidied to, and what is said about one that cannot be
 * made - held to the same cases the server refuses.
 */
import { describe, expect, it } from "vitest";
import { newFilePathProblem, tidyFilePath } from "./file-path";

const existing = ["src/App.tsx", "src/lib/utils.ts", "package.json"];

describe("tidyFilePath", () => {
  it("drops the spaces around a path and a leading ./", () => {
    expect(tidyFilePath("  ./src/notes.ts ")).toBe("src/notes.ts");
    expect(tidyFilePath(".env")).toBe(".env");
  });
});

describe("newFilePathProblem", () => {
  it("has nothing to say about an empty field or a good path", () => {
    expect(newFilePathProblem("", existing)).toBeNull();
    expect(newFilePathProblem("src/lib/notes.ts", existing)).toBeNull();
    expect(newFilePathProblem(".env", existing)).toBeNull();
    expect(newFilePathProblem("./server/index.ts", existing)).toBeNull();
  });

  it("refuses the shapes the server refuses", () => {
    expect(newFilePathProblem("/src/a.ts", existing)).toMatch(/first \//);
    expect(newFilePathProblem("src\\a.ts", existing)).toMatch(/Use \//);
    expect(newFilePathProblem("src//a.ts", existing)).toMatch(/empty folder/);
    expect(newFilePathProblem("src/", existing)).toMatch(/file's name/);
    expect(newFilePathProblem("src/../a.ts", existing)).toMatch(/\. or \.\./);
    expect(newFilePathProblem("a\u0007.ts", existing)).toMatch(/character/);
    expect(newFilePathProblem("a".repeat(401), existing)).toMatch(/400/);
  });

  it("refuses a path that is taken by a file or by a folder", () => {
    expect(newFilePathProblem("src/App.tsx", existing)).toMatch(/already a file/);
    expect(newFilePathProblem("src/lib", existing)).toMatch(/folder/);
    expect(newFilePathProblem("package.json/inner.ts", existing)).toMatch(/folder/);
  });
});
