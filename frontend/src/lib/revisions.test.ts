/**
 * Tests for lib/revisions: the words the History panel and the chat's Undo are built from.
 *
 * Handles: only revisions that landed are listed, newest first, with the first marked as the current one; a build is
 * named after the request in the caller's own chat and by its maker otherwise; a save by hand and a restore say what
 * they were; the file summary; the one sentence a restore is described with; which turns can be undone; and the
 * relative time.
 */
import { describe, expect, it } from "vitest";
import { canUndoTurn, describeFiles, historyEntries, requestsByRevision, restoreSummary, timeAgo, type TurnForHistory } from "./revisions";
import type { ProjectMember, RevisionSummary } from "./types";

const revision = (over: Partial<RevisionSummary>): RevisionSummary => ({
  id: 1,
  parentRevisionId: null,
  status: "APPLIED",
  source: "AI_GENERATION",
  createdByUserId: 7,
  createdAt: "2026-10-08T10:00:00Z",
  appliedAt: "2026-10-08T10:00:01Z",
  changedPaths: ["src/App.tsx"],
  ...over,
});

const members: ProjectMember[] = [
  { userId: 7, username: "me", name: "Me", role: "OWNER" },
  { userId: 9, username: "asha", name: "Asha", role: "EDITOR" },
];

describe("historyEntries", () => {
  it("lists only revisions that landed, newest first, and marks the first as current", () => {
    const entries = historyEntries(
      [revision({ id: 1 }), revision({ id: 3, status: "FAILED" }), revision({ id: 2 }), revision({ id: 4, status: "CONFLICT" })],
      [],
      members,
      7
    );

    expect(entries.map((entry) => entry.id)).toEqual([2, 1]);
    expect(entries.map((entry) => entry.isCurrent)).toEqual([true, false]);
  });

  it("names a build after the request that asked for it in the caller's own chat", () => {
    const entries = historyEntries(
      [revision({ id: 5 })],
      [
        { role: "user", content: "**Build** a todo list\n\nwith a dark theme" },
        { role: "assistant", content: "", revisionId: 5 },
      ],
      members,
      7
    );

    expect(entries[0].title).toBe("Build a todo list");
    expect(entries[0].byline).toBe("You");
  });

  it("names a build somebody else asked for by its maker, not by the caller's words", () => {
    const entries = historyEntries(
      [revision({ id: 5, createdByUserId: 9 })],
      [{ role: "user", content: "something of mine" }, { role: "assistant", content: "", revisionId: 4 }],
      members,
      7
    );

    expect(entries[0].title).toBe("A change built with AI");
    expect(entries[0].byline).toBe("Asha");
  });

  it("says what a save by hand and a restore were", () => {
    const entries = historyEntries(
      [
        revision({ id: 2, source: "RESTORE", changedPaths: ["a.ts", "b.ts"] }),
        revision({ id: 1, source: "MANUAL_EDIT", changedPaths: ["src/pages/Index.tsx"] }),
      ],
      [],
      members,
      7
    );

    expect(entries[0].title).toBe("Went back to an earlier version");
    expect(entries[1].title).toBe("Edited Index.tsx by hand");
    expect(entries[0].files).toBe("2 files: a.ts and b.ts");
    expect(entries[1].files).toBe("1 file: Index.tsx");
  });

  it("cuts a long request short", () => {
    const entries = historyEntries(
      [revision({ id: 5 })],
      [{ role: "user", content: "x".repeat(200) }, { role: "assistant", content: "", revisionId: 5 }],
      members,
      7
    );

    expect(entries[0].title.length).toBe(90);
    expect(entries[0].title.endsWith("…")).toBe(true);
  });
});

describe("requestsByRevision", () => {
  it("pairs each saved reply with the request before it and skips replies that saved nothing", () => {
    const requests = requestsByRevision([
      { role: "user", content: "first" },
      { role: "assistant", content: "", revisionId: 1 },
      { role: "user", content: "a question" },
      { role: "assistant", content: "" },
      { role: "user", content: "third" },
      { role: "assistant", content: "", revisionId: 2 },
    ]);

    expect([...requests]).toEqual([[1, "first"], [2, "third"]]);
  });
});

describe("describeFiles", () => {
  it("names up to two files and counts the rest", () => {
    expect(describeFiles([])).toBe("No files");
    expect(describeFiles(["src/App.tsx"])).toBe("App.tsx");
    expect(describeFiles(["src/App.tsx", "src/index.css"])).toBe("App.tsx and index.css");
    expect(describeFiles(["a/1.ts", "a/2.ts", "a/3.ts", "a/4.ts"])).toBe("1.ts, 2.ts and 2 more");
  });
});

describe("restoreSummary", () => {
  it("says nothing would change when the project already matches", () => {
    expect(restoreSummary([])).toBe("Your project already matches this version, so nothing would change.");
  });

  it("describes each kind of change in plain words", () => {
    expect(restoreSummary([{ path: "a", kind: "MODIFIED" }])).toBe("1 file will go back to how it was.");
    expect(
      restoreSummary([
        { path: "a", kind: "MODIFIED" },
        { path: "b", kind: "MODIFIED" },
        { path: "c", kind: "DELETED" },
        { path: "d", kind: "ADDED" },
      ])
    ).toBe("2 files will go back to how they were, 1 file added since will be removed and 1 file deleted since will come back.");
  });
});

describe("canUndoTurn", () => {
  it("offers undo only on a finished turn whose files were saved and whose revision is known", () => {
    expect(canUndoTurn({ revisionId: 3, outcome: "SAVED" })).toBe(true);
    expect(canUndoTurn({ revisionId: 3, outcome: "INCOMPLETE" })).toBe(true);
    expect(canUndoTurn({ revisionId: 3, outcome: "OUT_OF_BUDGET" })).toBe(true);
    expect(canUndoTurn({ revisionId: null, outcome: "SAVED" })).toBe(false);
    expect(canUndoTurn({ outcome: "SAVED" })).toBe(false);
    expect(canUndoTurn({ revisionId: 3, outcome: "ANSWERED" })).toBe(false);
    expect(canUndoTurn({ revisionId: 3, outcome: "SAVED", isStreaming: true })).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");

  it("moves from minutes to hours to days to a date", () => {
    expect(timeAgo("2026-10-08T11:59:40Z", now)).toBe("Just now");
    expect(timeAgo("2026-10-08T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-10-08T10:59:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-10-07T11:00:00Z", now)).toBe("Yesterday");
    expect(timeAgo("2026-10-05T11:00:00Z", now)).toBe("3 days ago");
    expect(timeAgo(null, now)).toBe("");
  });
});

describe("a history with steps back in it", () => {
  const made = (id: number, parent: number | null): RevisionSummary => ({
    id,
    parentRevisionId: parent,
    status: "APPLIED",
    source: "AI_GENERATION",
    createdByUserId: 1,
    createdAt: null,
    appliedAt: null,
    changedPaths: ["src/App.tsx"],
  });
  const wentBack = (id: number, parent: number, to: number, before: boolean): RevisionSummary => ({
    ...made(id, parent),
    source: "RESTORE",
    restoredRevisionId: to,
    restoredBefore: before,
  });
  const turns: TurnForHistory[] = [
    { role: "user", content: "A notes app" },
    { role: "assistant", content: "", revisionId: 1 },
    { role: "user", content: "Add a counter" },
    { role: "assistant", content: "", revisionId: 2 },
  ];
  const titles = (revisions: RevisionSummary[]) => historyEntries(revisions, turns, [], 1).map((entry) => entry.title);

  it("names a step back after what it went back to", () => {
    expect(titles([made(1, null), made(2, 1), wentBack(3, 2, 1, false)])[0]).toBe("Went back to: A notes app");
  });

  it("names an undo after the change it took back", () => {
    expect(titles([made(1, null), made(2, 1), wentBack(3, 2, 2, true)])[0]).toBe("Undid: Add a counter");
  });

  it("names a step back to a step back after where that one landed", () => {
    const history = [made(1, null), made(2, 1), wentBack(3, 2, 1, false), wentBack(4, 3, 3, false)];
    expect(titles(history)[0]).toBe("Went back to: A notes app");
  });

  it("keeps the plain wording for a step back whose target was never recorded", () => {
    const old = { ...made(3, 2), source: "RESTORE" as const };
    expect(titles([made(1, null), made(2, 1), old])[0]).toBe("Went back to an earlier version");
  });

  it("marks the earlier entry the project is the same as now", () => {
    const entries = historyEntries([made(1, null), made(2, 1), wentBack(3, 2, 1, false)], turns, [], 1);
    expect(entries.map((entry) => [entry.id, entry.isCurrent, entry.matchesCurrent])).toEqual([
      [3, true, false],
      [2, false, false],
      [1, false, true],
    ]);
  });

  it("marks the change before the one that was undone", () => {
    const entries = historyEntries([made(1, null), made(2, 1), wentBack(3, 2, 2, true)], turns, [], 1);
    expect(entries.find((entry) => entry.matchesCurrent)?.id).toBe(1);
  });

  it("marks nothing when the newest change is an ordinary one", () => {
    expect(historyEntries([made(1, null), made(2, 1)], turns, [], 1).some((entry) => entry.matchesCurrent)).toBe(false);
  });
});
