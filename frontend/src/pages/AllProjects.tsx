import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSidebar, SidebarSpacer, SidebarToggleSpace } from "@/components/AppSidebar";
import { ProjectCard, ProjectRow } from "@/components/ProjectCard";
import { ProjectFilterTabs } from "@/components/ProjectFilterTabs";
import { useProjectActions } from "@/hooks/use-project-actions";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { api, getUserInfo, isAuthenticated, loginRedirectPath } from "@/lib/api";
import {
    byLastEdited,
    countByFilter,
    matchesProjectFilter,
    parseProjectFilter,
    type ProjectFilter,
} from "@/lib/project-filters";
import { ProjectSummaryResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORT_LABELS = { edited: "Last edited", created: "Date created", name: "Name (A–Z)" } as const;
type SortKey = keyof typeof SORT_LABELS;

const VIEW_MODES = [
    { mode: "grid", label: "Grid view", Icon: LayoutGrid },
    { mode: "list", label: "List view", Icon: List },
] as const;
type ViewMode = (typeof VIEW_MODES)[number]["mode"];
const VIEW_MODE_KEY = "projects_view_mode";

const compareProjects: Record<SortKey, (a: ProjectSummaryResponse, b: ProjectSummaryResponse) => number> = {
    edited: byLastEdited,
    created: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    name: (a, b) => a.name.localeCompare(b.name),
};

// A soft copper tint at the top of the page.
const PAGE_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(70% 45% at 50% -8%, hsl(22 90% 55% / 0.22) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 8% 0%, hsl(340 82% 58% / 0.10) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 92% 0%, hsl(38 95% 60% / 0.10) 0%, transparent 70%)",
    ].join(", "),
};

const emptyCopy = (filter: ProjectFilter, term: string, query: string) => {
    if (term) return { title: `No projects match “${query}”`, hint: "Try a different search." };
    if (filter === "pinned") return { title: "No pinned projects", hint: "Pin a project from its menu to keep it close at hand." };
    if (filter === "starred") return { title: "No starred projects", hint: "Star the projects you love to find them here." };
    if (filter === "shared") return { title: "Nothing shared with you yet", hint: "Projects other people invite you to will show up here." };
    if (filter === "owned") return { title: "You don't own any projects yet", hint: "Describe an idea on the dashboard to create one." };
    return { title: "No projects yet", hint: "Describe an idea on the dashboard to create one." };
};

export function AllProjects() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const sidebar = useSidebar();
    const projectActions = useProjectActions();
    const [searchParams, setSearchParams] = useSearchParams();
    const ownershipFilter = parseProjectFilter(searchParams.get("filter"));

    const [searchQuery, setSearchQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("edited");
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try {
            return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
        } catch {
            return "grid";
        }
    });

    const firstName = getUserInfo()?.name?.trim().split(" ")[0];
    const pageTitle = firstName ? `${firstName}'s projects` : "Your projects";

    const isSignedIn = isAuthenticated();
    const { data: projects = [], isLoading, error } = useQuery({
        queryKey: ["projects"],
        queryFn: () => api.getProjects(),
        enabled: isSignedIn,
    });

    useEffect(() => {
        if (!isSignedIn) navigate(loginRedirectPath());
    }, [isSignedIn, navigate]);

    useEffect(() => {
        if (!error) return;
        toast({
            title: "Couldn't load projects",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
        });
    }, [error, toast]);

    useEffect(() => {
        try {
            localStorage.setItem(VIEW_MODE_KEY, viewMode);
        } catch {
            // Remembering the view is a convenience only
        }
    }, [viewMode]);

    const counts = useMemo(() => countByFilter(projects), [projects]);
    const term = searchQuery.trim().toLowerCase();
    const visibleProjects = useMemo(
        () =>
            projects
                .filter((project) => matchesProjectFilter(project, ownershipFilter) && project.name.toLowerCase().includes(term))
                .sort(compareProjects[sort]),
        [projects, ownershipFilter, term, sort]
    );
    const empty = emptyCopy(ownershipFilter, term, searchQuery.trim());

    const itemProps = (project: ProjectSummaryResponse) => ({
        project,
        onOpen: () => navigate(`/projects/${project.id}`),
        onDownload: () => projectActions.downloadProject(project),
        onDelete: () => projectActions.requestDelete(project),
        onFork: () => projectActions.requestFork(project),
        onTogglePin: () => projectActions.togglePin(project),
        onToggleStar: () => projectActions.toggleStar(project),
        isRenaming: projectActions.isRenaming(project),
        onStartRename: () => projectActions.startRename(project),
        onRenameDone: (name: string | null) => projectActions.finishRename(project, name),
    });

    const viewIndex = VIEW_MODES.findIndex((option) => option.mode === viewMode);

    return (
        <div className="relative flex h-screen overflow-hidden bg-background">
            <SidebarSpacer sidebar={sidebar} />

            <div className="relative flex min-w-0 flex-1 flex-col">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />

                <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
                    <SidebarToggleSpace sidebar={sidebar} />
                </header>

                {/* A reserved scrollbar gutter keeps the layout from shifting sideways as results change */}
                <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6">
                        <div className="mb-6">
                            <h1 className="font-display text-3xl font-semibold tracking-tight">{pageTitle}</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {isLoading
                                    ? "Loading your projects…"
                                    : `${counts.all} ${counts.all === 1 ? "project" : "projects"} · ${counts.owned} owned, ${counts.shared} shared with you`}
                            </p>
                        </div>

                        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border/60 bg-panel/70 p-2 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
                            <ProjectFilterTabs
                                value={ownershipFilter}
                                onChange={(key) => setSearchParams(key ? { filter: key } : {}, { replace: true })}
                                counts={counts}
                                isLoading={isLoading}
                            />

                            <div className="flex flex-wrap items-center gap-2">
                                <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 text-muted-foreground transition-[border-color,box-shadow] duration-150 hover:border-primary/40 focus-within:border-primary/60 focus-within:text-primary focus-within:ring-[3px] focus-within:ring-primary/15 sm:w-60 sm:flex-none">
                                    <Search className="h-3.5 w-3.5 shrink-0" />
                                    <input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search projects"
                                        aria-label="Search projects"
                                        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                                    />
                                </label>

                                <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                                    <SelectTrigger aria-label="Sort projects" className="h-8 w-[140px] rounded-lg border-border/60 bg-background/60 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                                            <SelectItem key={key} value={key}>{SORT_LABELS[key]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <div role="radiogroup" aria-label="View" className="relative grid shrink-0 grid-cols-2 rounded-lg border border-border/60 bg-background/60 p-0.5">
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md border border-primary/40 bg-primary/15 shadow-sm transition-transform duration-200 ease-out"
                                        style={{ transform: `translateX(${viewIndex * 100}%)` }}
                                    />
                                    {VIEW_MODES.map(({ mode, label, Icon }) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            role="radio"
                                            aria-checked={viewMode === mode}
                                            aria-label={label}
                                            onClick={() => setViewMode(mode)}
                                            className={cn(
                                                "relative z-10 flex h-7 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                viewMode === mode ? "text-primary" : "text-muted-foreground hover:text-primary"
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Fixed minimum height so switching to a tab with fewer (or no) projects doesn't collapse the page */}
                        <div className="min-h-[60vh]">
                            {isLoading ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-border/60 bg-card/60">
                                            <div className="aspect-[16/9] bg-muted" />
                                            <div className="flex items-center gap-3 px-3 py-2.5">
                                                <div className="h-8 w-8 rounded-lg bg-muted" />
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="h-3 w-2/3 rounded bg-muted" />
                                                    <div className="h-2.5 w-1/3 rounded bg-muted" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : visibleProjects.length === 0 ? (
                                <div className="flex h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-panel/40 px-6 text-center">
                                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-muted/40">
                                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                                    </span>
                                    <p className="text-sm font-medium">{empty.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{empty.hint}</p>
                                    {!term && (ownershipFilter === null || ownershipFilter === "owned") && (
                                        <Button variant="outline" size="sm" className="mt-4 h-8 text-xs" onClick={() => navigate("/projects?new=1")}>
                                            Start a project
                                        </Button>
                                    )}
                                </div>
                            ) : viewMode === "grid" ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {visibleProjects.map((project) => (
                                        <ProjectCard key={project.id} {...itemProps(project)} />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/70 bg-panel/60 p-1.5 backdrop-blur">
                                    <div className="flex items-center gap-3 px-3 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                        <span className="w-9 shrink-0" />
                                        <span className="flex-1">Name</span>
                                        <span className="hidden w-24 sm:block">Access</span>
                                        <span className="hidden w-40 md:block">Last edited</span>
                                        <span className="w-7 shrink-0" />
                                    </div>
                                    {visibleProjects.map((project) => (
                                        <ProjectRow key={project.id} {...itemProps(project)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {projectActions.deleteDialog}
            {projectActions.forkDialog}
            <AppSidebar sidebar={sidebar} />
        </div>
    );
}
