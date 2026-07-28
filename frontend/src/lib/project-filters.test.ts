/**
 * Covers grouping the sidebar: a pinned project appears only in Pinned, a starred one only in Starred, one that is
 * both appears in Pinned alone, one with neither in Recent - and no project ever appears in two sections.
 *
 * Also covers that Pinned and Starred are each ordered by when they were marked, independently of one another.
 */
import { describe, it, expect } from "vitest";
import { groupSidebarSections } from "./project-filters";
import type { ProjectSummaryResponse } from "./types";

const project = (
  id: number,
  name: string,
  overrides: Partial<Pick<ProjectSummaryResponse, "pinnedAt" | "starredAt" | "updatedAt">> = {}
): ProjectSummaryResponse => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
  pinnedAt: overrides.pinnedAt ?? null,
  starredAt: overrides.starredAt ?? null,
});

describe("groupSidebarSections", () => {
  it("puts a project that is only pinned in Pinned, and only Pinned", () => {
    const sections = groupSidebarSections([project(1, "A", { pinnedAt: "2026-02-01T00:00:00Z" })]);
    expect(sections.pinned.map((p) => p.id)).toEqual([1]);
    expect(sections.starred).toEqual([]);
    expect(sections.recent).toEqual([]);
  });

  it("puts a project that is only starred in Starred, and only Starred", () => {
    const sections = groupSidebarSections([project(1, "A", { starredAt: "2026-02-01T00:00:00Z" })]);
    expect(sections.starred.map((p) => p.id)).toEqual([1]);
    expect(sections.pinned).toEqual([]);
  });

  it("shows a project that is both pinned and starred in Pinned only - never in both", () => {
    const both = project(1, "Both", { pinnedAt: "2026-02-01T00:00:00Z", starredAt: "2026-02-02T00:00:00Z" });
    const sections = groupSidebarSections([both]);

    expect(sections.pinned.map((p) => p.id)).toEqual([1]);
    expect(sections.starred).toEqual([]);
    expect(sections.recent).toEqual([]);

    const totalAppearances = sections.pinned.length + sections.starred.length + sections.recent.length;
    expect(totalAppearances).toBe(1);
  });

  it("puts a project with neither flag in Recent, and only Recent", () => {
    const sections = groupSidebarSections([project(1, "A")]);
    expect(sections.recent.map((p) => p.id)).toEqual([1]);
    expect(sections.pinned).toEqual([]);
    expect(sections.starred).toEqual([]);
  });

  it("never lets a project appear in more than one section, across a mixed list", () => {
    const projects = [
      project(1, "PinnedOnly", { pinnedAt: "2026-02-01T00:00:00Z" }),
      project(2, "StarredOnly", { starredAt: "2026-02-01T00:00:00Z" }),
      project(3, "Both", { pinnedAt: "2026-02-03T00:00:00Z", starredAt: "2026-02-04T00:00:00Z" }),
      project(4, "Neither"),
    ];

    const sections = groupSidebarSections(projects);
    const seen = [...sections.pinned, ...sections.starred, ...sections.recent].map((p) => p.id);

    expect(seen.sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("orders Pinned and Starred by most recently pinned/starred, independently", () => {
    const projects = [
      project(1, "OlderPin", { pinnedAt: "2026-01-01T00:00:00Z" }),
      project(2, "NewerPin", { pinnedAt: "2026-03-01T00:00:00Z" }),
      project(3, "OlderStar", { starredAt: "2026-01-01T00:00:00Z" }),
      project(4, "NewerStar", { starredAt: "2026-03-01T00:00:00Z" }),
    ];

    const sections = groupSidebarSections(projects);
    expect(sections.pinned.map((p) => p.id)).toEqual([2, 1]);
    expect(sections.starred.map((p) => p.id)).toEqual([4, 3]);
  });
});
