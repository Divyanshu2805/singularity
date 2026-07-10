import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUp, Check, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectFilterTabs } from "@/components/ProjectFilterTabs";
import { AnimatedLogoMark } from "@/components/VibeCraftLogo";
import { IdeaClarifier } from "@/components/IdeaClarifier";
import { TeachingModeToggle } from "@/components/TeachingModeToggle";
import { useProjectActions } from "@/hooks/use-project-actions";
import { useSidebar } from "@/hooks/use-sidebar";
import { useTeachingMode } from "@/hooks/use-teaching-mode";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter-placeholder";
import { useToast } from "@/hooks/use-toast";
import { useBilling } from "@/hooks/use-billing";
import { QuotaDialog } from "@/components/QuotaDialog";
import type { QuotaDetails } from "@/lib/types";
import { api, getUserInfo, isAuthenticated, loginRedirectPath, isQuotaError } from "@/lib/api";
import { byLastEdited, countByFilter, matchesProjectFilter, type ProjectFilter } from "@/lib/project-filters";
import { cn } from "@/lib/utils";

// Module-level so the array reference stays stable for the typewriter hook.
const IDEA_SUGGESTIONS = [
    "a habit tracker with daily streaks",
    "a landing page for my coffee shop",
    "a kanban board for my side projects",
    "a personal finance dashboard with charts",
    "a recipe book with search and favorites",
];

const QUICK_STARTS = [
    "A todo app with drag and drop",
    "A portfolio site for a photographer",
    "A pricing page with three tiers",
];

// Mirrors the backend's real order of work (AI naming, then copying the starter template).
// The server doesn't report progress, so steps advance on typical timings - but the last step
// only starts once the server has actually answered, so it never claims to be done early.
const CREATION_STEPS = [
    { label: "Reading your idea", startsAtMs: 0 },
    { label: "Picking a project name", startsAtMs: 1200 },
    { label: "Setting up starter files", startsAtMs: 3500 },
    { label: "Opening your project", startsAtMs: Number.POSITIVE_INFINITY },
];
const OPEN_DELAY_MS = 700;

// One row of the most recently edited projects. The cards use ProjectCard's own 16:9, same as the All
// projects page, rather than being squashed to fit more in.
const RECENT_PROJECT_LIMIT = 4;
// Enough slots to hold the panel's height while it's empty or loading, before the real count is known.
const PLACEHOLDER_CARDS = 4;

const MAX_PROMPT_HEIGHT = 160;

const EMPTY_MESSAGES: Record<NonNullable<ProjectFilter> | "all", { title: string; hint: string }> = {
    all: { title: "No projects yet", hint: "Describe an idea above and it'll show up here." },
    owned: { title: "You don't own any projects yet", hint: "Projects you create will show up here." },
    shared: { title: "Nothing shared with you yet", hint: "Projects other people invite you to will show up here." },
    pinned: { title: "No pinned projects", hint: "Pin a project from its menu to keep it close at hand." },
    starred: { title: "No starred projects", hint: "Star the projects you love to find them here." },
};

// Lovable-style glow rising from the bottom of the hero, in the app's own copper/ember palette.
const HERO_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(60% 55% at 50% 100%, hsl(22 90% 55% / 0.75) 0%, transparent 70%)",
        "radial-gradient(45% 50% at 12% 100%, hsl(340 82% 58% / 0.55) 0%, transparent 70%)",
        "radial-gradient(45% 50% at 88% 100%, hsl(38 95% 60% / 0.45) 0%, transparent 70%)",
        "radial-gradient(70% 60% at 50% 65%, hsl(25 78% 56% / 0.18) 0%, transparent 75%)",
    ].join(", "),
};

const resizePrompt = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_PROMPT_HEIGHT)}px`;
};

interface Creation {
    description: string;
    startedAt: number;
    projectName?: string;
}

function CreationProgress({ creation, now }: { creation: Creation; now: number }) {
    const elapsedMs = now - creation.startedAt;
    const lastIndex = CREATION_STEPS.length - 1;
    const activeIndex = creation.projectName
        ? lastIndex
        : CREATION_STEPS.reduce((current, step, index) => (index < lastIndex && elapsedMs >= step.startsAtMs ? index : current), 0);
    const progress = creation.projectName ? 100 : Math.min(92, 8 + (elapsedMs / 9000) * 84);

    return (
        <div
            role="status"
            aria-live="polite"
            className="mt-7 w-full overflow-hidden rounded-3xl border border-primary/40 bg-card/90 text-left shadow-2xl shadow-black/40 backdrop-blur animate-in fade-in-0 zoom-in-95 duration-200"
        >
            <div className="h-1 w-full bg-primary/10">
                <div className="h-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <div className="p-5">
                <p className="line-clamp-2 text-sm text-muted-foreground">&ldquo;{creation.description}&rdquo;</p>
                <ol className="mt-4 space-y-2.5">
                    {CREATION_STEPS.map((step, index) => {
                        const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
                        return (
                            <li
                                key={step.label}
                                className={cn(
                                    "flex items-center gap-3 text-sm transition-colors duration-300",
                                    state === "pending" && "text-muted-foreground/50",
                                    state === "active" && "text-foreground",
                                    state === "done" && "text-muted-foreground"
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                                        state === "done" && "border-primary/40 bg-primary/15 text-primary",
                                        state === "active" && "border-primary/60",
                                        state === "pending" && "border-border"
                                    )}
                                >
                                    {state === "done" ? (
                                        <Check className="h-3 w-3" />
                                    ) : state === "active" ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                    ) : (
                                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                                    )}
                                </span>
                                {index === lastIndex && creation.projectName ? (
                                    <span>
                                        Opening <span className="font-medium text-primary">{creation.projectName}</span>
                                    </span>
                                ) : (
                                    step.label
                                )}
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}

/** Same outer shape as a ProjectCard, so loading and empty states keep the row's height. */
function CardPlaceholder({ className }: { className?: string }) {
    return (
        <div aria-hidden="true" className={cn("overflow-hidden rounded-xl border border-border/60 bg-card/60", className)}>
            <div className="aspect-[16/9] bg-muted" />
            <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-muted" />
                <div className="flex h-9 flex-1 flex-col justify-center gap-1.5">
                    <div className="h-3 w-2/3 rounded bg-muted" />
                    <div className="h-2.5 w-1/3 rounded bg-muted" />
                </div>
            </div>
        </div>
    );
}

export function ProjectsDashboard() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const sidebar = useSidebar();
    const projectActions = useProjectActions();
    // Set here, it covers the new project's first build - usually the biggest one, and the one most worth explaining.
    const [teachingMode, setTeachingMode] = useTeachingMode();
    const [searchParams, setSearchParams] = useSearchParams();

    const [prompt, setPrompt] = useState("");
    const [creation, setCreation] = useState<Creation | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [filter, setFilter] = useState<ProjectFilter>(null);
    // The idea currently going through the pre-project interview, if any.
    const [clarifyingIdea, setClarifyingIdea] = useState<string | null>(null);
    const promptRef = useRef<HTMLTextAreaElement>(null);

    const isCreating = creation !== null;
    const isSignedIn = isAuthenticated();
    const firstName = getUserInfo()?.name?.split(" ")[0];
    const ideaPlaceholder = useTypewriterPlaceholder(IDEA_SUGGESTIONS, !isCreating && prompt.length === 0);

    const { data: projects = [], isLoading, error } = useQuery({
        queryKey: ["projects"],
        queryFn: () => api.getProjects(),
        enabled: isSignedIn,
    });

    // Without a usable session the backend returns an error, which used to look like "no projects"
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

    // Ticks the creation progress card forward while a project is being set up.
    useEffect(() => {
        if (!creation) return;
        const interval = window.setInterval(() => setNow(Date.now()), 200);
        return () => window.clearInterval(interval);
    }, [creation]);

    // "New project" in the sidebar links here with ?new=1; older ?filter links now live on the All projects page.
    useEffect(() => {
        const filterParam = searchParams.get("filter");
        if (filterParam) {
            navigate(`/projects/all?filter=${encodeURIComponent(filterParam)}`, { replace: true });
            return;
        }
        if (searchParams.get("new") !== "1") return;
        promptRef.current?.focus();
        const next = new URLSearchParams(searchParams);
        next.delete("new");
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams, navigate]);

    // A 402 from any of the create/interview calls: shown as an offer rather than an error, since the request
    // was fine and paying is what makes it work.
    const [blockedBy, setBlockedBy] = useState<QuotaDetails | null>(null);
    const { refresh: refreshBilling, quota, projects: projectAllowance, subscription } = useBilling();

    // Enter on an idea starts the short interview; the project itself is created once that's done or skipped.
    const handleCreate = () => {
        const description = prompt.trim();
        if (!description || isCreating || clarifyingIdea) return;

        // Checked before the interview, not after: it's a minute of answering questions, and being refused at the
        // end of it for a limit we already knew about is the worst way to find out. The server still enforces
        // both - this only spares the wasted effort.
        const planName = subscription?.plan?.name ?? "Free";
        if (projectAllowance?.isExhausted) {
            setBlockedBy({ reason: "PROJECT_LIMIT", limit: projectAllowance.limit, used: projectAllowance.used, planName });
            return;
        }
        if (quota?.isExhausted) {
            setBlockedBy({
                reason: "DAILY_TOKENS",
                limit: quota.limit,
                used: quota.used,
                resetsAt: quota.resetsAt?.toISOString() ?? null,
                planName,
            });
            return;
        }
        setClarifyingIdea(description);
    };

    /** Creates the project named from the idea, then opens it with `firstMessage` (the brief) as its first chat message. */
    const createProject = async (description: string, firstMessage: string) => {
        setClarifyingIdea(null);
        const startedAt = Date.now();
        setNow(startedAt);
        setCreation({ description, startedAt });
        try {
            const project = await api.createProjectFromPrompt(description);
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            setCreation((prev) => (prev ? { ...prev, projectName: project.name } : prev));
            // A short beat on the final step, so it's clear what was created before the page changes.
            // The project page sends the brief as the first chat message once it has loaded.
            window.setTimeout(() => {
                navigate(`/projects/${project.id}`, { state: { initialPrompt: firstMessage } });
            }, OPEN_DELAY_MS);
        } catch (err) {
            setCreation(null);
            if (isQuotaError(err) && err.quota) {
                // Out of projects or out of tokens - an upgrade prompt, not a red toast.
                setBlockedBy(err.quota);
                void refreshBilling();
                return;
            }
            toast({
                title: "Couldn't create project",
                description: err instanceof Error ? err.message : "Please try again.",
                variant: "destructive",
            });
        }
    };

    const applyIdea = (idea: string) => {
        setPrompt(idea);
        const el = promptRef.current;
        if (!el) return;
        el.focus();
        requestAnimationFrame(() => {
            resizePrompt(el);
            el.setSelectionRange(idea.length, idea.length);
        });
    };

    const counts = useMemo(() => countByFilter(projects), [projects]);
    const recentProjects = useMemo(
        () => projects.filter((project) => matchesProjectFilter(project, filter)).sort(byLastEdited).slice(0, RECENT_PROJECT_LIMIT),
        [projects, filter]
    );
    const emptyMessage = EMPTY_MESSAGES[filter ?? "all"];
    /**
     * The grid always renders this many slots, real cards first and invisible ones after, so switching tabs
     * never changes the panel's height and nothing above it moves. It's sized by the fullest tab ("All" is a
     * superset of the rest), so an account with three projects gets three slots rather than a blank one.
     */
    const slotCount = Math.min(RECENT_PROJECT_LIMIT, Math.max(counts.all, 1));

    return (
        <div className="relative flex h-screen overflow-hidden bg-background">
            <SidebarSpacer sidebar={sidebar} />

            <div className="relative flex min-w-0 flex-1 flex-col">
                {/* Everything fits one screen; only very short windows fall back to scrolling. The sidebar is a
                    sibling of this scroller inside the h-screen shell, so it stays put if they do. */}
                <main className="min-h-0 flex-1 overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        {/* Hero: describe a project to create it */}
                        <section className="relative flex min-h-[420px] flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-12">
                            <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={HERO_GLOW} />

                            <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
                                {/* The interview card is taller than the prompt box, so the logo steps aside to keep the page on one screen */}
                                {!clarifyingIdea && <AnimatedLogoMark glow className="mb-6 h-16 w-16" />}
                                <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                                    {/* Asking for an idea while one is already being built reads as if nothing happened. */}
                                    {creation
                                        ? creation.projectName
                                            ? `Setting up ${creation.projectName}`
                                            : "Setting up your project"
                                        : clarifyingIdea
                                            ? "Let's shape your idea"
                                            : `Got an idea${firstName ? `, ${firstName}` : ""}?`}
                                </h1>

                                {creation ? (
                                    <CreationProgress creation={creation} now={now} />
                                ) : clarifyingIdea ? (
                                    <IdeaClarifier
                                        idea={clarifyingIdea}
                                        onEditIdea={() => {
                                            setClarifyingIdea(null);
                                            requestAnimationFrame(() => promptRef.current?.focus());
                                        }}
                                        onComplete={(firstMessage) => createProject(clarifyingIdea, firstMessage)}
                                        onQuotaExceeded={(details) => {
                                            setClarifyingIdea(null);
                                            setBlockedBy(details);
                                            void refreshBilling();
                                        }}
                                    />
                                ) : (
                                    <>
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                handleCreate();
                                            }}
                                            className="group mt-7 w-full rounded-3xl border border-border/80 bg-card/90 p-3 text-left shadow-2xl shadow-black/40 backdrop-blur transition-[border-color,box-shadow] duration-150 hover:border-primary/40 focus-within:border-primary/60 focus-within:shadow-[0_0_0_4px_hsl(var(--primary)/0.12),0_25px_50px_-12px_rgb(0_0_0/0.5)]"
                                        >
                                            <div className="flex items-start">
                                                {/* Terminal-style prompt that lights up while typing */}
                                                <span
                                                    aria-hidden="true"
                                                    className="select-none pl-2 pt-1 text-[17px] font-semibold leading-6 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
                                                >
                                                    ›
                                                </span>
                                                <textarea
                                                    ref={promptRef}
                                                    value={prompt}
                                                    rows={2}
                                                    aria-label="Describe the project you want to build"
                                                    placeholder={`Ask VibeCraft to build ${ideaPlaceholder}`}
                                                    onChange={(e) => {
                                                        setPrompt(e.target.value);
                                                        resizePrompt(e.target);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                                            e.preventDefault();
                                                            handleCreate();
                                                        }
                                                    }}
                                                    className="block min-h-[56px] w-full flex-1 resize-none bg-transparent px-2.5 pt-1 text-[15px] leading-6 text-foreground caret-primary outline-none placeholder:text-muted-foreground"
                                                />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3 pl-2">
                                                <span className="min-w-0 truncate text-xs text-muted-foreground">Enter to create · Shift+Enter for a new line</span>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <TeachingModeToggle size="md" enabled={teachingMode} onChange={setTeachingMode} />
                                                    <Button
                                                        type="submit"
                                                        size="icon"
                                                        aria-label="Create project"
                                                        disabled={!prompt.trim()}
                                                        className="h-9 w-9 shrink-0 rounded-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                                                    >
                                                        <ArrowUp />
                                                    </Button>
                                                </div>
                                            </div>
                                        </form>

                                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                                            {QUICK_STARTS.map((idea) => (
                                                <button
                                                    key={idea}
                                                    type="button"
                                                    onClick={() => applyIdea(idea)}
                                                    className="rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                                                >
                                                    {idea}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>

                        {/* Recent projects: a raised panel overlapping the bottom of the hero, one steady height */}
                        <section className="relative z-10 mx-auto -mt-14 w-full max-w-6xl shrink-0 px-4 pb-5 sm:px-6">
                            <div className="rounded-2xl border border-border/70 bg-panel/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <ProjectFilterTabs value={filter} onChange={setFilter} counts={counts} isLoading={isLoading} />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(filter ? `/projects/all?filter=${filter}` : "/projects/all")}
                                        className="h-8 gap-1.5 text-xs [&_svg]:size-3.5"
                                    >
                                        Browse all projects
                                        <ArrowRight />
                                    </Button>
                                </div>

                                <div className="relative -m-1 grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 lg:grid-cols-4">
                                    {isLoading
                                        ? Array.from({ length: PLACEHOLDER_CARDS }, (_, i) => (
                                            <CardPlaceholder key={i} className={cn("animate-pulse", i > 0 && "hidden sm:block")} />
                                        ))
                                        : recentProjects.map((project) => (
                                            <ProjectCard
                                                key={project.id}
                                                project={project}
                                                onOpen={() => navigate(`/projects/${project.id}`)}
                                                onDownload={() => projectActions.downloadProject(project)}
                                                onDelete={() => projectActions.requestDelete(project)}
                                                onFork={() => projectActions.requestFork(project)}
                                                onTogglePin={() => projectActions.togglePin(project)}
                                                onToggleStar={() => projectActions.toggleStar(project)}
                                                isRenaming={projectActions.isRenaming(project)}
                                                onStartRename={() => projectActions.startRename(project)}
                                                onRenameDone={(name) => projectActions.finishRename(project, name)}
                                            />
                                        ))}

                                    {/* Invisible cards fill the rest of the grid, so a tab with fewer projects is
                                        exactly as tall as the fullest one and the hero above never shifts. */}
                                    {!isLoading &&
                                        Array.from({ length: Math.max(slotCount - recentProjects.length, 0) }, (_, i) => (
                                            <CardPlaceholder key={`slot-${i}`} className="invisible" />
                                        ))}

                                    {!isLoading && recentProjects.length === 0 && (
                                        <div className="absolute inset-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/60 px-4 text-center">
                                            <FolderOpen className="mb-1 h-5 w-5 text-muted-foreground/70" />
                                            <p className="text-sm font-medium">{emptyMessage.title}</p>
                                            <p className="text-xs text-muted-foreground">{emptyMessage.hint}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </main>

                {projectActions.deleteDialog}
                <QuotaDialog quota={blockedBy} onClose={() => setBlockedBy(null)} />
                {projectActions.forkDialog}
            </div>

            <AppSidebar sidebar={sidebar} />
        </div>
    );
}
