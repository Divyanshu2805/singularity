/**
 * Covers that the delete wording matches who is asking: the owner is told the project goes for everyone, anyone else
 * that it only leaves their own projects.
 */
import { describe, expect, it } from "vitest";
import { deleteCopy } from "./project-delete";

describe("deleteCopy", () => {
  it("tells the owner the project goes for everyone", () => {
    const copy = deleteCopy("OWNER", "Notes app");
    expect(copy.menuLabel).toBe("Delete project");
    expect(copy.description).toMatch(/deleted for everyone/);
  });

  it("tells an editor it only leaves their own projects", () => {
    const copy = deleteCopy("EDITOR", "Notes app");
    expect(copy.menuLabel).toBe("Remove project");
    expect(copy.description).toMatch(/isn't deleted/);
    expect(copy.description).toContain("Notes app");
  });
});
