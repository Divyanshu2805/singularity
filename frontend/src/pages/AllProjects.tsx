/**
 * The full project list, as rows rather than cards.
 *
 * Handles: filtering, searching, sorting by last edited, renaming in place, and the per-project actions - with the
 * same filter tabs and counts the dashboard uses.
 *
 * It stands on the app's night as the billing, security and usage pages do (.dash-night, in the rounded inset frame
 * beside the docked sidebar): a page a step lighter than the surround, a wash of rose, amber and gold breathing at the foot of the screen
 * with stars above it (Nebula - the wash took the gas nebula's place) and one faint gold glow at its head. It was the one signed-in page left outside that shell, on the old
 * near-black page with the dim app-wide tokens, which is why it stayed dark when the others were lightened. It sits
 * under the shared page heading (PageHeading - a mono eyebrow, a
 * Fraunces title with an italic gold close, its words dropping in), its panels are solid raised surfaces that rise in one
 * after another (index.css, .app-glass, .app-rise), and anything working shows the app's comet (OrbitSpinner).
 *
 * The controls stand straight on the page, all one height: the filter track, the search well, the sort chip and the
 * view switch are each a bordered capsule already, and a panel round all four made capsules inside a capsule inside
 * a capsule. The list (ProjectList) is one panel: a band of column labels over a hairline, then the rows, with a
 * single gold highlight gliding between them (hooks/use-glide-highlight, index.css .project-list) - the row paints no
 * hover of its own. The highlight stays on a row while that row's menu is open. While loading, each view shows a
 * skeleton of its own shape.
 */
import { Nebula } from "@/components/app/Nebula";
import { PageHeading } from "@/components/app/PageHeading";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { ProjectCard, ProjectRow } from "@/components/ProjectCard";
import { ProjectFilterTabs } from "@/components/ProjectFilterTabs";
import { useProjectActions } from "@/hooks/use-project-actions";
import { useSidebar } from "@/hooks/use-sidebar";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
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
import { OPEN_SEARCH_EVENT } from "@/lib/search-event";

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

const PAGE_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(70% 45% at 50% -8%, hsl(40.7 99.9% 76.1% / 0.07) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 8% 0%, hsl(28 100% 56% / 0.04) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 92% 0%, hsl(41.3 100% 85.6% / 0.04) 0%, transparent 70%)",
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

function ProjectList({ children }: { children: ReactNode }) {
    const listRef = useRef<HTMLDivElement>(null);
    const glideRef = useGlideHighlight(listRef);
    return (
        <div className="app-glass app-rise overflow-hidden rounded-[22px]" style={{ "--i": 2 } as CSSProperties}>
            <div className="app-label flex items-center gap-3.5 border-b border-white/[0.07] bg-white/[0.015] px-[19px] py-3">
                <span className="w-9 shrink-0" />
                <span className="flex-1">Name</span>
                <span className="hidden w-28 sm:block">Access</span>
                <span className="hidden w-44 md:block">Last edited</span>
                <span className="w-7 shrink-0" />
            </div>
            <div ref={listRef} className="project-list relative flex flex-col gap-0.5 p-1.5">
                <span ref={glideRef} aria-hidden="true" className="glide-pill rounded-xl" />
                {children}
            </div>
        </div>
    );
}

export function AllProjects() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const sidebar = useSidebar();
    const projectActions = useProjectActions();
    const [searchParams, setSearchParams] = useSearchParams();
    const ownershipFilter = parseProjectFilter(searchParams.get("filter"));

    const searchQuery = "";
    const [sort, setSort] = useState<SortKey>("edited");
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try {
            return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
        } catch {
            return "grid";
        }
    });

    const firstName = getUserInfo()?.name?.trim().split(" ")[0];
    const pageTitle = firstName ? `${firstName}'s` : "Your";

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
        isLeaving: projectActions.isLeaving(project),
        onStartRename: () => projectActions.startRename(project),
        onRenameDone: (name: string | null) => projectActions.finishRename(project, name),
    });

    const viewIndex = VIEW_MODES.findIndex((option) => option.mode === viewMode);

    return (
        <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
            <Nebula />
            <SidebarSpacer sidebar={sidebar} />

            <div className="dash-frame relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />

                <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
                </header>

                <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6">
                        <div className="mb-6">
                            <PageHeading eyebrow="Workspace" title={pageTitle} accent="projects">
                                {isLoading
                                    ? "Loading your projects…"
                                    : `${counts.all} ${counts.all === 1 ? "project" : "projects"} · ${counts.owned} owned, ${counts.shared} shared with you`}
                            </PageHeading>
                        </div>

                        <div className="app-rise mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" style={{ "--i": 1 } as CSSProperties}>
                            <ProjectFilterTabs
                                value={ownershipFilter}
                                onChange={(key) => setSearchParams(key ? { filter: key } : {}, { replace: true })}
                                counts={counts}
                                isLoading={isLoading}
                            />

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    aria-label="Search projects"
                                    onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
                                    className="app-field flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 text-left text-muted-foreground sm:w-64 sm:flex-none"
                                >
                                    <Search className="h-3.5 w-3.5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-[13px]">Search projects</span>
                                </button>

                                <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                                    <SelectTrigger chip aria-label="Sort projects" className="h-[38px] w-[150px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                                            <SelectItem key={key} value={key}>{SORT_LABELS[key]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <div role="radiogroup" aria-label="View" className="app-track relative grid shrink-0 grid-cols-2 p-[3px]">
                                    <span
                                        aria-hidden="true"
                                        className="seg-pill absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] transition-transform duration-[650ms] ease-[cubic-bezier(0.34,1.35,0.64,1)]"
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
                                                "relative z-10 flex h-[30px] w-9 items-center justify-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                                                viewMode === mode ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="min-h-[60vh]">
                            {isLoading && viewMode === "list" ? (
                                <ProjectList>
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="flex items-center gap-3.5 px-3 py-3">
                                            <div className="app-skeleton h-9 w-9 shrink-0 rounded-[10px]" />
                                            <div className="flex-1">
                                                <div className="app-skeleton h-3 w-40 max-w-full rounded" />
                                            </div>
                                            <div className="hidden w-28 sm:block">
                                                <div className="app-skeleton h-5 w-14 rounded-full" />
                                            </div>
                                            <div className="hidden w-44 md:block">
                                                <div className="app-skeleton h-3 w-24 rounded" />
                                            </div>
                                            <span className="w-7 shrink-0" />
                                        </div>
                                    ))}
                                </ProjectList>
                            ) : isLoading ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="app-card overflow-hidden rounded-2xl">
                                            <div className="app-skeleton aspect-[16/9]" />
                                            <div className="flex items-center gap-3 px-3 py-2.5">
                                                <div className="app-skeleton h-8 w-8 rounded-lg" />
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="app-skeleton h-3 w-2/3 rounded" />
                                                    <div className="app-skeleton h-2.5 w-1/3 rounded" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : visibleProjects.length === 0 ? (
                                <div className="app-fade flex h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
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
                                    {visibleProjects.map((project, index) => (
                                        <div key={project.id} className="app-rise" style={{ "--i": Math.min(index, 12), "--rise-delay": "160ms" } as CSSProperties}>
                                            <ProjectCard {...itemProps(project)} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <ProjectList>
                                    {visibleProjects.map((project) => (
                                        <ProjectRow key={project.id} {...itemProps(project)} />
                                    ))}
                                </ProjectList>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {projectActions.deleteDialog}
            {projectActions.forkDialog}
            <AppSidebar sidebar={sidebar} inset />
        </div>
    );
}
