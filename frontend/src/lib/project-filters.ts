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

/**
 * Splits projects into the sidebar's three sections so each project appears in exactly one - unlike
 * `matchesProjectFilter`, whose "pinned"/"starred" cases are deliberately non-exclusive (switching between
 * the All Projects filter tabs, one at a time, is meant to show a project under both if it qualifies for
 * both). The sidebar shows every section at once, so the same overlap there means the same project renders
 * twice in a row with no way to tell why - pinning something that's already starred now moves it out of
 * Starred instead of appending it there too.
 */
export function groupSidebarSections(projects: ProjectSummaryResponse[]): SidebarSections {
    const pinned = projects.filter((project) => project.pinnedAt).sort(byNewest("pinnedAt"));
    const starred = projects.filter((project) => project.starredAt && !project.pinnedAt).sort(byNewest("starredAt"));
    const recent = projects.filter((project) => !project.pinnedAt && !project.starredAt).sort(byLastEdited);
    return { pinned, starred, recent };
}
