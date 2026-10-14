import { beforeEach, describe, expect, it } from "vitest";
import { hasTitle, markTitleRequested, projectTitle, resetTitleRequests, shouldRequestTitle, withTitle } from "./project-title";
import type { ProjectSummaryResponse } from "./types";

const untitled = { name: "Notes", summary: null };
const ready = { projectId: "4", project: untitled, canEdit: true, hasFinishedTurn: true, isStreaming: false };

describe("project title", () => {
  beforeEach(() => resetTitleRequests());

  it("shows the title, and the name while there is none", () => {
    expect(projectTitle({ name: "Notes", summary: "Quick notes you can jot down" })).toBe("Quick notes you can jot down");
    expect(projectTitle(untitled)).toBe("Notes");
    expect(projectTitle({ name: "Notes", summary: "   " })).toBe("Notes");
    expect(projectTitle(null, "project")).toBe("project");
    expect(hasTitle(untitled)).toBe(false);
  });

  it("asks for a title only for an untitled project someone may edit, after a finished turn", () => {
    expect(shouldRequestTitle(ready)).toBe(true);
    expect(shouldRequestTitle({ ...ready, canEdit: false })).toBe(false);
    expect(shouldRequestTitle({ ...ready, hasFinishedTurn: false })).toBe(false);
    expect(shouldRequestTitle({ ...ready, isStreaming: true })).toBe(false);
    expect(shouldRequestTitle({ ...ready, project: { name: "Notes", summary: "Notes app" } })).toBe(false);
    expect(shouldRequestTitle({ ...ready, project: undefined })).toBe(false);
  });

  it("asks once per project until sign-out", () => {
    markTitleRequested("4");
    expect(shouldRequestTitle(ready)).toBe(false);
    expect(shouldRequestTitle({ ...ready, projectId: "5" })).toBe(true);
    resetTitleRequests();
    expect(shouldRequestTitle(ready)).toBe(true);
  });

  it("puts a title, and a new name, into the cached list for that project only", () => {
    const list = [
      { id: 4, name: "Notes", createdAt: "" },
      { id: 5, name: "Kanban", summary: "Kanban board", createdAt: "" },
    ] as ProjectSummaryResponse[];

    const titled = withTitle(list, "4", "Quick notes")!;
    expect(titled[0]).toMatchObject({ name: "Notes", summary: "Quick notes" });
    expect(titled[1]).toBe(list[1]);
    expect(withTitle(list, "4", "Jotter", "Jotter")![0]).toMatchObject({ name: "Jotter", summary: "Jotter" });
    expect(withTitle(undefined, "4", "x")).toBeUndefined();
  });
});
