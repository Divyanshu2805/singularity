/**
 * The home page once signed in: start something new, or pick up where you left off.
 *
 * Handles: the prompt box that creates a project from a description (through the idea interview), the recent projects
 * as cards, filtering and searching, and the per-project actions. An idea a visitor typed on the landing page before
 * signing up (lib/pending-idea) arrives here in the prompt, with the mode they picked, ready to send - it is never
 * sent by itself, so the quota checks and the interview still run when they press Build.
 *
 * It is set in the landing page's night, so signing in carries on in the same place rather than cutting to a
 * different app: the root carries .dash-night (index.css), which gives the page the landing's Inter type and brighter
 * text, and .dash-sky, which makes the page near-black at its head, lightening only towards the wash of colour at its foot,
 * and its panel and cards black with hairlines strong enough to tell each from the one under it (the owner asked for
 * black cards and a darker head once the app had turned gold; they were charcoal steps, each lighter than the last,
 * before that). The page sits in a rounded inset frame (.dash-frame) beside the docked sidebar, as
 * Lovable's does, with the sidebar standing on the plain surround around it (AppSidebar's inset). Behind everything is a living yellow, orange and brown
 * nebula standing at the foot of the screen with stars round it (Nebula), held there whatever the scroll - the
 * starfield that first sat behind the page was removed when the owner found the app too dark, the nebula, taken out
 * with it, was asked back, then asked to look like a real nebula with stars round it, and then gave way to the wash
 * of rose, amber and gold that Nebula draws now, with more stars and a shooting star now and then - a low gold tint rising from the
 * hero's foot (gold and amber, kept faint so it colours the night without becoming a band of its own -
 * a stronger one, with a rose corner, turned the projects panel into an ember haze and muddied its text; it runs a
 * little way behind the panel and fades out there, since stopping at the hero's edge drew a hard line across the
 * page), a soft gold bloom behind the prompt, the horizon mark building itself above a Fraunces headline in
 * near-white whose italic pale-gold accent is the visitor's name, the prompt on a matte glass card that takes a calm
 * gold ring while it has focus, and the recent projects on a glass panel below. The page arrives in a short
 * staggered rise - mark, headline (its words dropping in, as the landing hero's do, and again whenever the headline
 * changes between asking, shaping and setting up), prompt, suggestions, then the projects dealt in one after another - kept well under a second, since this is a
 * page people come back to all day, not one they see once.
 *
 * Creating a project shows its progress on the same glass: a progress line that fills as it works, and each step's
 * comet (OrbitSpinner) while it is the one under way.
 *
 * Placeholders keep a row's exact height while loading, so the page does not jump as projects arrive; they shimmer
 * rather than blink.
 */
import { Nebula } from "@/components/app/Nebula";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, ArrowUp, Camera, Check, FolderOpen, Layers, ListChecks, Sparkles } from "lucide-react";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectFilterTabs } from "@/components/ProjectFilterTabs";
import { Button } from "@/components/ui/button";
import { HorizonMark } from "@/components/HorizonMark";
import { IdeaClarifier } from "@/components/IdeaClarifier";
import { PromptModeMenu } from "@/components/PromptModeMenu";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { HeadlineWords } from "@/components/landing/HeadlineWords";
import { WORD_DROP } from "@/components/landing/intro";
import { play } from "@/components/landing/motion";
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
import { IDEA_SUGGESTIONS } from "@/lib/idea-suggestions";
import { clearInterview, startInterview, useInterview } from "@/lib/idea-interview";
import { takePendingIdea } from "@/lib/pending-idea";

const QUICK_STARTS = [
    { idea: "A todo app with drag and drop", Icon: ListChecks },
    { idea: "A portfolio site for a photographer", Icon: Camera },
    { idea: "A pricing page with three tiers", Icon: Layers },
];

const CREATION_STEPS = [
    { label: "Reading your idea", startsAtMs: 0 },
    { label: "Picking a project name", startsAtMs: 1200 },
    { label: "Setting up starter files", startsAtMs: 3500 },
    { label: "Opening your project", startsAtMs: Number.POSITIVE_INFINITY },
];
const OPEN_DELAY_MS = 700;

const RECENT_PROJECT_LIMIT = 4;
const PLACEHOLDER_CARDS = 4;

const MAX_PROMPT_HEIGHT = 160;

const EMPTY_MESSAGES: Record<NonNullable<ProjectFilter> | "all", { title: string; hint: string }> = {
    all: { title: "No projects yet", hint: "Describe an idea above and it'll show up here." },
    owned: { title: "You don't own any projects yet", hint: "Projects you create will show up here." },
    shared: { title: "Nothing shared with you yet", hint: "Projects other people invite you to will show up here." },
    pinned: { title: "No pinned projects", hint: "Pin a project from its menu to keep it close at hand." },
    starred: { title: "No starred projects", hint: "Star the projects you love to find them here." },
};

const HERO_TINT: CSSProperties = {
    backgroundImage: [
        "radial-gradient(60% 45% at 50% 78%, hsl(40.7 99.9% 76.1% / 0.12) 0%, transparent 70%)",
        "radial-gradient(45% 40% at 12% 78%, hsl(46 88% 62% / 0.05) 0%, transparent 70%)",
        "radial-gradient(45% 40% at 88% 78%, hsl(41.3 100% 85.6% / 0.08) 0%, transparent 70%)",
        "radial-gradient(70% 50% at 50% 52%, hsl(40.4 99.9% 77.1% / 0.05) 0%, transparent 75%)",
    ].join(", "),
    maskImage: "linear-gradient(to bottom, #000 62%, transparent)",
    WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent)",
};

const stagger = (index: number, delayMs = 0) => ({ "--i": index, "--rise-delay": `${delayMs}ms` }) as CSSProperties;

const resizePrompt = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_PROMPT_HEIGHT)}px`;
};

interface Creation {
    description: string;
    startedAt: number;
    projectName?: string;
}

function Headline({ lead, accent }: { lead: string; accent: string }) {
    const ref = useRef<HTMLHeadingElement>(null);

    useLayoutEffect(() => {
        const words = ref.current?.querySelectorAll("[data-word]");
        if (!words) return;
        return play(words, WORD_DROP, { delay: 120, step: 55, duration: 900 });
    }, [lead, accent]);

    return (
        <h1
            ref={ref}
            className="landing-heading dash-headline font-display text-[38px] font-semibold leading-[1.04] tracking-[-0.025em] sm:text-[52px]"
        >
            <HeadlineWords text={lead} />{" "}
            <em data-word className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-2 font-semibold not-italic motion-reduce:animate-none">
                {accent}
            </em>
        </h1>
    );
}

function CreationProgress({ creation, now }: { creation: Creation; now: number }) {
    const elapsedMs = now - creation.startedAt;
    const lastIndex = CREATION_STEPS.length - 1;
    const activeIndex = creation.projectName
        ? lastIndex
        : CREATION_STEPS.reduce((current, step, index) => (index < lastIndex && elapsedMs >= step.startsAtMs ? index : current), 0);
    const progress = creation.projectName ? 100 : Math.min(92, 8 + (elapsedMs / 9000) * 84);

    return (
        <div role="status" aria-live="polite" className="app-glass app-rise relative mt-8 w-full rounded-[22px] text-left">
            <div className="px-5 pb-5 pt-4">
                <p className="line-clamp-2 text-sm text-muted-foreground">&ldquo;{creation.description}&rdquo;</p>
                <div className="app-progress mt-4">
                    <div className="app-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <ol className="mt-5 space-y-3">
                    {CREATION_STEPS.map((step, index) => {
                        const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
                        return (
                            <li
                                key={step.label}
                                className={cn(
                                    "flex items-center gap-3 text-sm transition-colors duration-500",
                                    state === "pending" && "text-muted-foreground/45",
                                    state === "active" && "text-foreground",
                                    state === "done" && "text-muted-foreground"
                                )}
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                                    {state === "done" ? (
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary">
                                            <Check className="h-3 w-3" />
                                        </span>
                                    ) : state === "active" ? (
                                        <OrbitSpinner className="h-[18px] w-[18px]" />
                                    ) : (
                                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35" />
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

function CardPlaceholder({ className, shimmer = true }: { className?: string; shimmer?: boolean }) {
    const block = shimmer ? "app-skeleton" : "bg-muted/40";
    return (
        <div aria-hidden="true" className={cn("app-card overflow-hidden rounded-2xl", className)}>
            <div className={cn("aspect-[16/9] border-b border-transparent", block)} />
            <div className="flex items-center gap-3 px-3 py-3">
                <div className={cn("h-8 w-8 shrink-0 rounded-lg", block)} />
                <div className="flex h-[38px] flex-1 flex-col justify-center gap-1.5">
                    <div className={cn("h-3 w-2/3 rounded", block)} />
                    <div className={cn("h-2.5 w-1/3 rounded", block)} />
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
    const [teachingMode, setTeachingMode] = useTeachingMode();
    const [searchParams, setSearchParams] = useSearchParams();

    const [prompt, setPrompt] = useState("");
    const [creation, setCreation] = useState<Creation | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [filter, setFilter] = useState<ProjectFilter>(null);
    const clarifyingIdea = useInterview()?.idea ?? null;
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
        if (!creation) return;
        const interval = window.setInterval(() => setNow(Date.now()), 200);
        return () => window.clearInterval(interval);
    }, [creation]);

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

    useEffect(() => {
        if (!isSignedIn) return;
        const pending = takePendingIdea();
        if (!pending) return;
        setPrompt(pending.text);
        setTeachingMode(pending.teaching);
        requestAnimationFrame(() => {
            const el = promptRef.current;
            if (!el) return;
            el.focus();
            resizePrompt(el);
            el.setSelectionRange(pending.text.length, pending.text.length);
        });
    }, [isSignedIn, setTeachingMode]);

    const [blockedBy, setBlockedBy] = useState<QuotaDetails | null>(null);
    const { refresh: refreshBilling, quota, projects: projectAllowance, subscription } = useBilling();

    const handleCreate = () => {
        const description = prompt.trim();
        if (!description || isCreating || clarifyingIdea) return;

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
        startInterview(description);
    };

    const createProject = async (description: string, firstMessage: string) => {
        clearInterview();
        const startedAt = Date.now();
        setNow(startedAt);
        setCreation({ description, startedAt });
        try {
            const project = await api.createProjectFromPrompt(description);
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            setCreation((prev) => (prev ? { ...prev, projectName: project.name } : prev));
            window.setTimeout(() => {
                navigate(`/projects/${project.id}`, { state: { initialPrompt: firstMessage } });
            }, OPEN_DELAY_MS);
        } catch (err) {
            setCreation(null);
            if (isQuotaError(err) && err.quota) {
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
    const slotCount = Math.min(RECENT_PROJECT_LIMIT, Math.max(counts.all, 1));

    const headline = creation
        ? creation.projectName
            ? { lead: "Setting up", accent: creation.projectName }
            : { lead: "Setting up your", accent: "project" }
        : clarifyingIdea
            ? { lead: "Let's shape your", accent: "idea" }
            : firstName
                ? { lead: "Got an idea,", accent: `${firstName}?` }
                : { lead: "Got an", accent: "idea?" };
    const eyebrow = creation ? "Building" : clarifyingIdea ? "A few quick questions" : null;

    return (
        <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
            <Nebula />
            <SidebarSpacer sidebar={sidebar} />

            <div className="dash-frame relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
                <main className="min-h-0 flex-1 overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <section className="relative flex min-h-[460px] flex-1 flex-col items-center justify-center px-6 pb-24 pt-14">
                            <div aria-hidden="true" className="app-fade pointer-events-none absolute inset-x-0 top-0 -bottom-[160px]" style={HERO_TINT} />
                            <div
                                aria-hidden="true"
                                className="app-bloom absolute left-1/2 top-1/2 h-[560px] w-[min(1000px,110%)] -translate-x-1/2 -translate-y-1/2"
                            />

                            <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
                                {!clarifyingIdea && (
                                    <span className="relative mb-7 inline-flex h-16 w-16">
                                        <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
                                        <HorizonMark drawn className="relative h-full w-full" />
                                    </span>
                                )}
                                {eyebrow && (
                                    <p key={eyebrow} className="app-eyebrow app-fade mb-4" style={stagger(1)}>
                                        {eyebrow}
                                    </p>
                                )}
                                <Headline lead={headline.lead} accent={headline.accent} />

                                {creation ? (
                                    <CreationProgress creation={creation} now={now} />
                                ) : clarifyingIdea ? (
                                    <IdeaClarifier
                                        onEditIdea={() => {
                                            clearInterview();
                                            requestAnimationFrame(() => promptRef.current?.focus());
                                        }}
                                        onComplete={(firstMessage) => createProject(clarifyingIdea, firstMessage)}
                                        onQuotaExceeded={(details) => {
                                            clearInterview();
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
                                            className="app-glass app-prompt app-rise group relative mt-8 w-full rounded-[22px] p-3 text-left"
                                            style={stagger(0, 300)}
                                        >
                                            <div className="flex items-start">
                                                <span
                                                    aria-hidden="true"
                                                    className="prompt-badge mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70"
                                                >
                                                    <Sparkles className="no-icon-anim h-4 w-4" />
                                                </span>
                                                <textarea
                                                    ref={promptRef}
                                                    value={prompt}
                                                    rows={2}
                                                    aria-label="Describe the project you want to build"
                                                    placeholder={`Ask Singularity to build ${ideaPlaceholder}`}
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
                                                    className="app-prompt-input block min-h-[64px] w-full flex-1 resize-none bg-transparent px-3 pt-1.5 text-[15px] font-normal leading-6 tracking-[-0.005em] text-white caret-white outline-none placeholder:text-white/70"
                                                />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3 pl-2">
                                                <span className="min-w-0 truncate text-xs text-muted-foreground">Enter to create · Shift+Enter for a new line</span>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <PromptModeMenu teaching={teachingMode} onChange={setTeachingMode} />
                                                    <button type="submit" aria-label="Create project" disabled={!prompt.trim()} className="app-send h-9 w-9">
                                                        <ArrowUp className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </form>

                                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                                            {QUICK_STARTS.map(({ idea, Icon }, index) => (
                                                <button
                                                    key={idea}
                                                    type="button"
                                                    onClick={() => applyIdea(idea)}
                                                    className="idea-chip app-rise group/idea"
                                                    style={stagger(index, 460)}
                                                >
                                                    <Icon className="h-3.5 w-3.5 shrink-0 text-white/55 transition-all duration-300 group-hover/idea:text-[hsl(46_100%_85%)]" />
                                                    {idea}
                                                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/45 transition-all duration-300 group-hover/idea:translate-x-0.5 group-hover/idea:text-[hsl(46_100%_85%)]" />
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>

                        <section className="relative z-10 mx-auto -mt-12 w-full max-w-6xl shrink-0 px-4 pb-6 sm:px-6">
                            <div className="app-glass app-rise rounded-[22px] p-4 sm:p-5" style={stagger(0, 420)}>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <ProjectFilterTabs value={filter} onChange={setFilter} counts={counts} isLoading={isLoading} />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(filter ? `/projects/all?filter=${filter}` : "/projects/all")}
                                        style={{ "--icon-hover": "translateX(3px)" } as CSSProperties}
                                        className="h-8 gap-1.5 px-3.5 text-xs [&_svg]:size-3.5"
                                    >
                                        Browse all projects
                                        <ArrowRight />
                                    </Button>
                                </div>

                                <div className="relative -m-1 grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 lg:grid-cols-4">
                                    {isLoading
                                        ? Array.from({ length: PLACEHOLDER_CARDS }, (_, i) => (
                                            <CardPlaceholder key={i} className={cn(i > 0 && "hidden sm:block")} />
                                        ))
                                        : recentProjects.map((project, index) => (
                                            <div key={project.id} className="app-rise" style={stagger(index, 520)}>
                                                <ProjectCard
                                                    project={project}
                                                    onOpen={() => navigate(`/projects/${project.id}`)}
                                                    onDownload={() => projectActions.downloadProject(project)}
                                                    onDelete={() => projectActions.requestDelete(project)}
                                                    onFork={() => projectActions.requestFork(project)}
                                                    onTogglePin={() => projectActions.togglePin(project)}
                                                    onToggleStar={() => projectActions.toggleStar(project)}
                                                    isRenaming={projectActions.isRenaming(project)}
                                                    isLeaving={projectActions.isLeaving(project)}
                                                    onStartRename={() => projectActions.startRename(project)}
                                                    onRenameDone={(name) => projectActions.finishRename(project, name)}
                                                />
                                            </div>
                                        ))}

                                    {!isLoading &&
                                        Array.from({ length: Math.max(slotCount - recentProjects.length, 0) }, (_, i) => (
                                            <CardPlaceholder key={`slot-${i}`} shimmer={false} className="invisible" />
                                        ))}

                                    {!isLoading && recentProjects.length === 0 && (
                                        <div className="app-fade absolute inset-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 text-center">
                                            <FolderOpen className="mb-1 h-5 w-5 text-primary/60" />
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

            <AppSidebar sidebar={sidebar} inset />
        </div>
    );
}
