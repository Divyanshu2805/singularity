/**
 * The sidebar panel: the project list, grouped and searchable, with everything a project row can do.
 *
 * Handles: the pinned, starred and recent groups, filtering and renaming, the per-project actions menu, creating a
 * project, and the links to the dashboard, billing and settings.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { canForkProject } from "@/lib/project-fork";
import { deleteCopy } from "@/lib/project-delete";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  ChevronsUpDown,
  BarChart3,
  CreditCard,
  Download,
  GitFork,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  ShieldCheck,
  Star,
  StarOff,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OverflowSlideText } from "@/components/OverflowSlideText";
import { ProjectCommandPalette } from "@/components/ProjectCommandPalette";
import { useBilling } from "@/hooks/use-billing";
import { useProjectActions } from "@/hooks/use-project-actions";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter-placeholder";
import { api, getUserInfo, signOut } from "@/lib/api";
import { formatResetIn, formatTokens } from "@/lib/billing";
import { groupSidebarSections } from "@/lib/project-filters";
import type { ProjectSummaryResponse } from "@/lib/types";
import { cn, generateGradient } from "@/lib/utils";

const RECENT_LIMIT = 12;
const SECTION_LIMIT = 2;
const SEARCH_SHORTCUT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
const COLLAPSED_SECTIONS_KEY = "sidebar_collapsed_sections";

type ProjectActions = ReturnType<typeof useProjectActions>;

interface SidebarPanelProps {
  currentProjectId?: string;
  onNavigate?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}

const ROW_CLASS =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50";

function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY) ?? "[]"));
    } catch {
      return new Set<string>();
    }
  });

  const toggle = (section: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      try {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...next]));
      } catch {
      }
      return next;
    });

  return { isCollapsed: (section: string) => collapsed.has(section), toggle };
}

function NavItem({ icon: Icon, label, onClick, trailing }: { icon: LucideIcon; label: string; onClick: () => void; trailing?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("group", ROW_CLASS, "text-muted-foreground hover:bg-muted/50 hover:text-primary")}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{children}</p>
  );
}

const NEW_PROJECT_PHRASES = ["Start a new project"];
const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function NewProjectItem({ onClick }: { onClick: () => void }) {
  const typed = useTypewriterPlaceholder(NEW_PROJECT_PHRASES, !PREFERS_REDUCED_MOTION);
  const text = PREFERS_REDUCED_MOTION ? NEW_PROJECT_PHRASES[0] : typed;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Start a new project"
      className="group mb-1.5 flex h-10 w-full items-center gap-2 rounded-lg border border-border/80 bg-background/60 pl-3 pr-1.5 text-left transition-[border-color,background-color,box-shadow] duration-150 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden="true" className="select-none text-base font-semibold leading-none text-primary">
        ›
      </span>
      <span
        aria-hidden="true"
        className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-pre text-[13px] text-muted-foreground transition-colors group-hover:text-foreground"
      >
        {text}
        <span className="ml-px inline-block h-4 w-[2px] shrink-0 bg-primary animate-cursor-blink motion-reduce:animate-none" />
      </span>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <Plus className="h-4 w-4" />
      </span>
    </button>
  );
}

function RenameField({ project, onDone }: { project: ProjectSummaryResponse; onDone: (name: string | null) => void }) {
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDoneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    const next = draft.trim();
    onDone(save && next && next !== project.name ? next : null);
  };

  return (
    <div className="flex h-8 items-center gap-2.5 rounded-md bg-background px-2 ring-1 ring-inset ring-primary/60">
      <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded ring-1 ring-inset ring-white/10" style={generateGradient(project.name)} />
      <input
        ref={inputRef}
        value={draft}
        maxLength={255}
        aria-label={`Rename ${project.name}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground caret-primary outline-none"
      />
    </div>
  );
}

function ProjectItem({ project, isCurrent, isRenaming, onOpen, onStartRename, onRenameDone, onMenuOpenChange, actions }: {
  project: ProjectSummaryResponse;
  isCurrent: boolean;
  isRenaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onRenameDone: (name: string | null) => void;
  onMenuOpenChange?: (open: boolean) => void;
  actions: ProjectActions;
}) {
  const canEdit = project.role === "OWNER" || project.role === "EDITOR";
  const pendingRenameRef = useRef(false);
  const beginPendingRename = () => {
    if (!pendingRenameRef.current) return;
    pendingRenameRef.current = false;
    onStartRename();
  };

  return (
    <li className="group/item relative">
      {isRenaming ? (
        <RenameField project={project} onDone={onRenameDone} />
      ) : (
        <button
          type="button"
          aria-current={isCurrent ? "page" : undefined}
          onClick={onOpen}
          className={cn(
            "group/row",
            ROW_CLASS,
            "pr-8",
            isCurrent
              ? "bg-primary/20 font-medium text-primary ring-1 ring-inset ring-primary/40"
              : "text-muted-foreground hover:bg-muted/50 hover:text-primary"
          )}
        >
          <span className="h-4 w-4 shrink-0 rounded ring-1 ring-inset ring-white/10" style={generateGradient(project.name)} />
          <OverflowSlideText text={project.name} />
        </button>
      )}
      <DropdownMenu modal={false} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${project.name}`}
            className={cn(
              "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-primary/15 hover:text-primary focus-visible:opacity-100 group-hover/item:opacity-100 data-[state=open]:bg-primary/15 data-[state=open]:text-primary data-[state=open]:opacity-100",
              isRenaming && "hidden"
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          className="min-w-[180px]"
          onCloseAutoFocus={(e) => {
            if (!pendingRenameRef.current) return;
            e.preventDefault();
            beginPendingRename();
          }}
        >
          {canEdit && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  pendingRenameRef.current = true;
                  window.setTimeout(beginPendingRename, 400);
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => actions.togglePin(project)}>
            {project.pinnedAt ? <PinOff /> : <Pin />}
            {project.pinnedAt ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.toggleStar(project)}>
            {project.starredAt ? <StarOff /> : <Star />}
            {project.starredAt ? "Remove star" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.downloadProject(project)}>
            <Download />
            Download ZIP
          </DropdownMenuItem>
          {canForkProject(project.role) && (
            <DropdownMenuItem onClick={() => actions.requestFork(project)}>
              <GitFork />
              Fork project
            </DropdownMenuItem>
          )}
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => actions.requestDelete(project)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive [&[data-highlighted]_svg]:text-destructive"
              >
                <Trash2 />
                {deleteCopy(project.role, project.name).menuLabel}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function ProjectSection({ icon: Icon, label, projects, limit = SECTION_LIMIT, emptyMessage, isCollapsed, onToggle, renderProjects, onShowMore }: {
  icon?: LucideIcon;
  label: string;
  projects: ProjectSummaryResponse[];
  limit?: number;
  emptyMessage?: string;
  isCollapsed: boolean;
  onToggle: () => void;
  renderProjects: (projects: ProjectSummaryResponse[]) => ReactNode;
  onShowMore: () => void;
}) {
  if (projects.length === 0 && !emptyMessage) return null;
  const hiddenCount = projects.length - limit;
  const contentId = `sidebar-section-${label.toLowerCase()}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        className="group flex w-full items-center gap-1.5 rounded-md px-2 pb-1 pt-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
      >
        {Icon && <Icon className="h-3 w-3" />}
        <span>{label}</span>
        {isCollapsed && projects.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
            {projects.length}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-[transform,opacity] duration-200",
            isCollapsed ? "-rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          )}
        />
      </button>

      <div
        id={contentId}
        ref={(el) => {
          if (!el) return;
          if (isCollapsed) el.setAttribute("inert", "");
          else el.removeAttribute("inert");
        }}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {projects.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">{emptyMessage}</p>
          ) : (
            renderProjects(projects.slice(0, limit))
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onShowMore}
              aria-label={`Show ${hiddenCount} more ${label.toLowerCase()} projects`}
              className="group relative mt-0.5 flex h-7 w-full items-center justify-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
            >
              <span
                aria-hidden="true"
                className="tracking-[0.2em] transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
              >
                ···
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                Show more <span className="text-primary/80">+{hiddenCount}</span>
                <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentSection({ label, projects, limit, emptyMessage, isCollapsed, onToggle, renderProjects, onShowMore }: {
  label: string;
  projects: ProjectSummaryResponse[];
  limit: number;
  emptyMessage: string;
  isCollapsed: boolean;
  onToggle: () => void;
  renderProjects: (projects: ProjectSummaryResponse[]) => ReactNode;
  onShowMore: () => void;
}) {
  const hiddenCount = projects.length - limit;
  const contentId = "sidebar-section-recent";

  return (
    <div className={cn("flex min-h-0 flex-col", !isCollapsed && "flex-1")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        className="group flex w-full shrink-0 items-center gap-1.5 rounded-md px-2 pb-1 pt-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
      >
        <span>{label}</span>
        {isCollapsed && projects.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
            {projects.length}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-[transform,opacity] duration-200",
            isCollapsed ? "-rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          )}
        />
      </button>

      {!isCollapsed && (
        <div id={contentId} className="min-h-0 flex-1 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">{emptyMessage}</p>
          ) : (
            <>
              {renderProjects(projects.slice(0, limit))}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={onShowMore}
                  aria-label={`Show ${hiddenCount} more ${label.toLowerCase()} projects`}
                  className="group relative mt-0.5 flex h-7 w-full shrink-0 items-center justify-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                >
                  <span
                    aria-hidden="true"
                    className="tracking-[0.2em] transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                  >
                    ···
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    Show more <span className="text-primary/80">+{hiddenCount}</span>
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UsageMeter({ onUpgrade }: { onUpgrade: () => void }) {
  const { quota, subscription } = useBilling();

  if (!quota || (!quota.isLow && !quota.isExhausted)) return null;

  return (
    <div
      className={cn(
        "mb-2 rounded-lg border px-2.5 py-2",
        quota.isExhausted ? "border-destructive/40 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground/85">
          {quota.isExhausted ? "Out of AI tokens" : "Running low"}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {formatTokens(quota.used)}/{formatTokens(quota.limit)}
        </span>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full rounded-full", quota.isExhausted ? "bg-destructive" : "bg-amber-500")}
          style={{ width: `${quota.percent}%` }}
        />
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        Refills in {formatResetIn(quota.resetsAt)}.
      </p>

      {subscription?.isFree !== false && (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-1.5 text-[11px] font-medium text-primary transition-colors hover:underline"
        >
          Upgrade for more
        </button>
      )}
    </div>
  );
}

export function SidebarPanel({ currentProjectId, onNavigate, onMenuOpenChange }: SidebarPanelProps) {
  const navigate = useNavigate();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const sections = useCollapsedSections();
  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.getProjects(),
  });

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  const actions = useProjectActions({
    onDeleted: (project) => {
      if (String(project.id) === currentProjectId) go("/projects");
    },
  });

  const setPaletteOpen = (open: boolean) => {
    setIsPaletteOpen(open);
    onMenuOpenChange?.(open);
  };

  const paletteToggleRef = useRef(() => setPaletteOpen(!isPaletteOpen));
  paletteToggleRef.current = () => setPaletteOpen(!isPaletteOpen);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteToggleRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const startRename = (project: ProjectSummaryResponse) => {
    setRenamingId(project.id);
    window.setTimeout(() => onMenuOpenChange?.(true), 0);
  };

  const finishRename = (project: ProjectSummaryResponse, name: string | null) => {
    setRenamingId(null);
    onMenuOpenChange?.(false);
    if (name) actions.renameProject(project, name);
  };

  const userInfo = getUserInfo();
  const initial = userInfo?.name?.charAt(0).toUpperCase() || "U";

  const handleLogout = () => signOut();

  const { pinned, starred, recent } = useMemo(() => groupSidebarSections(projects ?? []), [projects]);

  const renderProjects = (list: ProjectSummaryResponse[]) => (
    <ul className="space-y-0.5">
      {list.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isCurrent={String(project.id) === currentProjectId}
          isRenaming={renamingId === project.id}
          onOpen={() => go(`/projects/${project.id}`)}
          onStartRename={() => startRename(project)}
          onRenameDone={(name) => finishRename(project, name)}
          onMenuOpenChange={onMenuOpenChange}
          actions={actions}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="space-y-0.5 px-2 pt-2">
        <NewProjectItem onClick={() => go("/projects?new=1")} />
        <NavItem
          icon={Search}
          label="Search"
          onClick={() => setPaletteOpen(true)}
          trailing={
            <kbd className="rounded border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              {SEARCH_SHORTCUT}
            </kbd>
          }
        />
        <NavItem icon={LayoutDashboard} label="Dashboard" onClick={() => go("/projects")} />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        <div className="shrink-0">
          <SectionLabel>Projects</SectionLabel>
          <NavItem icon={LayoutGrid} label="All projects" onClick={() => go("/projects/all")} />
          <NavItem icon={User} label="Owned by me" onClick={() => go("/projects/all?filter=owned")} />
          <NavItem icon={Users} label="Shared with me" onClick={() => go("/projects/all?filter=shared")} />

          {!isLoading && !isError && (
            <>
              <ProjectSection
                icon={Pin}
                label="Pinned"
                projects={pinned}
                isCollapsed={sections.isCollapsed("pinned")}
                onToggle={() => sections.toggle("pinned")}
                renderProjects={renderProjects}
                onShowMore={() => go("/projects/all?filter=pinned")}
              />
              <ProjectSection
                icon={Star}
                label="Starred"
                projects={starred}
                isCollapsed={sections.isCollapsed("starred")}
                onToggle={() => sections.toggle("starred")}
                renderProjects={renderProjects}
                onShowMore={() => go("/projects/all?filter=starred")}
              />
            </>
          )}
        </div>

        {isLoading ? (
          <>
            <SectionLabel>Recent</SectionLabel>
            <div className="space-y-2 px-2 py-1">
              {[70, 55, 62].map((width) => (
                <div key={width} className="flex animate-pulse items-center gap-2.5">
                  <div className="h-4 w-4 rounded bg-muted" />
                  <div className="h-3 rounded bg-muted" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </>
        ) : isError ? (
          <p className="px-2 pt-4 text-xs text-muted-foreground">Couldn&rsquo;t load projects</p>
        ) : (
          <RecentSection
            label="Recent"
            projects={recent}
            limit={RECENT_LIMIT}
            emptyMessage={(projects ?? []).length === 0 ? "No projects yet" : "Everything is pinned or starred"}
            isCollapsed={sections.isCollapsed("recent")}
            onToggle={() => sections.toggle("recent")}
            renderProjects={renderProjects}
            onShowMore={() => go("/projects/all")}
          />
        )}
      </div>

      <div className="border-t border-border/60 p-2">
        {!currentProjectId && <UsageMeter onUpgrade={() => go("/pricing")} />}

        <DropdownMenu onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-primary/10"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{userInfo?.name || "Signed in"}</span>
                <span className="block truncate text-xs text-muted-foreground">{userInfo?.username}</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{userInfo?.name || "Signed in"}</p>
              <p className="truncate text-xs text-muted-foreground">{userInfo?.username}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => go("/usage")}>
              <BarChart3 />
              Usage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/billing")}>
              <CreditCard />
              Plans &amp; billing
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/security")}>
              <ShieldCheck />
              Security
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectCommandPalette open={isPaletteOpen} onOpenChange={setPaletteOpen} projects={projects ?? []} onNavigate={go} />
      {actions.deleteDialog}
      {actions.forkDialog}
    </div>
  );
}
