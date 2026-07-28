/**
 * How the project list is filtered, counted, sorted and grouped.
 *
 * Handles: the filter set and parsing one out of a URL, deciding whether a project matches, counting each filter for
 * the tab badges, ordering by last edited, and grouping the sidebar into pinned, starred and the rest.
 */
import type { ProjectSummaryResponse } from "./types";

export const PROJECT_FILTERS = [
    { key: null, label: "All" },
    { key: "owned", label: "Owned by me" },
    { key: "shared", label: "Shared with me" },
    { key: "pinned", label: "Pinned" },
    { key: "starred", label: "Starred" },
] as const;

export type ProjectFilter = (typeof PROJECT_FILTERS)[number]["key"];
export type ProjectFilterCounts = Record<NonNullable<ProjectFilter> | "all", number>;

const FILTER_KEYS = new Set<string>(PROJECT_FILTERS.flatMap((filter) => (filter.key ? [filter.key] : [])));

export const parseProjectFilter = (value: string | null): ProjectFilter =>
    value && FILTER_KEYS.has(value) ? (value as ProjectFilter) : null;

export function matchesProjectFilter(project: ProjectSummaryResponse, filter: ProjectFilter) {
    switch (filter) {
        case "owned":
            return project.role === "OWNER";
        case "shared":
            return !!project.role && project.role !== "OWNER";
        case "pinned":
            return !!project.pinnedAt;
        case "starred":
            return !!project.starredAt;
        default:
            return true;
    }
}

export const countByFilter = (projects: ProjectSummaryResponse[]): ProjectFilterCounts => ({
    all: projects.length,
    owned: projects.filter((p) => matchesProjectFilter(p, "owned")).length,
    shared: projects.filter((p) => matchesProjectFilter(p, "shared")).length,
    pinned: projects.filter((p) => matchesProjectFilter(p, "pinned")).length,
    starred: projects.filter((p) => matchesProjectFilter(p, "starred")).length,
});

export const byLastEdited = (a: ProjectSummaryResponse, b: ProjectSummaryResponse) =>
    new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime();

const byNewest = (field: "pinnedAt" | "starredAt") => (a: ProjectSummaryResponse, b: ProjectSummaryResponse) =>
    new Date(b[field] ?? 0).getTime() - new Date(a[field] ?? 0).getTime();

export interface SidebarSections {
    pinned: ProjectSummaryResponse[];
    starred: ProjectSummaryResponse[];
    recent: ProjectSummaryResponse[];
}

export function groupSidebarSections(projects: ProjectSummaryResponse[]): SidebarSections {
    const pinned = projects.filter((project) => project.pinnedAt).sort(byNewest("pinnedAt"));
    const starred = projects.filter((project) => project.starredAt && !project.pinnedAt).sort(byNewest("starredAt"));
    const recent = projects.filter((project) => !project.pinnedAt && !project.starredAt).sort(byLastEdited);
    return { pinned, starred, recent };
}
