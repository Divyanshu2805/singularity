/**
 * The sidebar panel: the project list, grouped and searchable, with everything a project row can do.
 *
 * Handles: the pinned, starred and recent groups, filtering and renaming, the per-project actions menu, creating a
 * project, the links to the dashboard, billing and settings, marking the row for the page you are on, and laying all
 * of it out for both the open panel and the closed icon rail (AppSidebar).
 *
 * Its rows follow the owner's BitBin sidebar: Inter at 13.5px, under the landing page's small mono capitals for
 * section labels (BitBin's "// projects" code-comment labels were tried and turned down), with BitBin's two gliding
 * highlights - one that follows the pointer from row to row (use-glide-highlight) and one under the row for the page
 * you are on, a nav row or the open project, which slides to the new row when you navigate (use-active-pill). Every
 * row but the new-project one (which lights itself) is marked data-glide and positioned, so it paints over both (index.css,
 * .glide-pill, .active-pill). Both are the prompt's Build/Teach menu highlight - a gold wash fading rightwards with
 * a soft glow inside its left edge - the selected one deeper, with a glow pooled at its left end and a soft gold
 * drop shadow (a solid tab at the sidebar's edge was tried and removed); a hovered or selected row's label nudges right (the sidebar's alone - menus hold still),
 * and its icon turns pale gold (open only - on the rail the icons hold still). Each row's icon answers the pointer
 * with a small motion of its own
 * (.icon-pop, set per icon through --icon-hover: the search glass tilts, the grid turns, the people lift, the plus
 * turns a quarter).
 *
 * On the rail every icon stays exactly where it sits in the open panel - rows are padded so their icons fall on the
 * rail's centre line - while labels, counts and shortcuts fade (.sidebar-fade, which keeps their space, so nothing
 * shifts up or down), the project groups fade with them and go inert, and the usage warning folds away
 * (.sidebar-fold). Rail rows name themselves in a tooltip instead; open, the tooltips stay shut. The new-project row
 * is a row like the others with a gold plus badge kept on the rail's centre line, so closed it is simply a plus.
 * Open, it reads as a small field labelled "New project" woven from the sheet of space-time the "Continue with
 * Google" button is made of (SpacetimeFabric, on a canvas under the label): a fine grid that dips towards the plus,
 * its mass, with slow rings spreading from it and a few stars lying on it, and that sinks towards the pointer while
 * it is on the row. The owner asked for that fabric here by name. On the rail there is no sheet, only the plus.
 * Turned down before this: a few invitations typed out in turn (the row sat half-empty), a gold spill across the row
 * with a letter-by-letter label roll, the badge filling with a hue-turning project-tile blend (it read green, off the
 * palette), and a few gold stars resting on the row that fell into the plus under the pointer.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { SpacetimeFabric } from "@/components/auth/SpacetimeFabric";
import { canForkProject } from "@/lib/project-fork";
import { deleteCopy } from "@/lib/project-delete";
import { useLocation, useNavigate } from "react-router-dom";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OverflowSlideText } from "@/components/OverflowSlideText";
import { ProjectCommandPalette } from "@/components/ProjectCommandPalette";
import { OPEN_SEARCH_EVENT } from "@/lib/search-event";
import { useBilling } from "@/hooks/use-billing";
import { useProjectActions } from "@/hooks/use-project-actions";
import { api, getUserInfo, signOut } from "@/lib/api";
import { formatResetIn, formatTokens } from "@/lib/billing";
import { groupSidebarSections } from "@/lib/project-filters";
import type { ProjectSummaryResponse } from "@/lib/types";
import { useActivePill } from "@/hooks/use-active-pill";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { cn, generateGradient } from "@/lib/utils";

const RECENT_LIMIT = 12;
const SECTION_LIMIT = 2;
const SEARCH_SHORTCUT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
const COLLAPSED_SECTIONS_KEY = "sidebar_collapsed_sections";

type ProjectActions = ReturnType<typeof useProjectActions>;

interface SidebarPanelProps {
  currentProjectId?: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

const ROW_CLASS =
  "sidebar-row relative flex h-8 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 text-left text-[13.5px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50";

const iconMotion = (transform: string) => ({ "--icon-hover": transform }) as CSSProperties;

const setInert = (inert: boolean) => (el: HTMLElement | null) => {
  if (!el) return;
  if (inert) el.setAttribute("inert", "");
  else el.removeAttribute("inert");
};

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

function RailTip({ label, rail, children }: { label: string; rail: boolean; children: ReactElement }) {
  return (
    <Tooltip delayDuration={120} open={rail ? undefined : false}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={14} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function NavItem({ icon: Icon, label, onClick, trailing, motion, active, rail }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  trailing?: ReactNode;
  motion?: string;
  active?: boolean;
  rail: boolean;
}) {
  return (
    <RailTip label={label} rail={rail}>
      <button
        type="button"
        data-glide
        aria-label={rail ? label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        style={motion ? iconMotion(motion) : undefined}
        className={cn(
          "group",
          ROW_CLASS,
          active ? "font-medium text-foreground" : "text-foreground/70 hover:text-foreground"
        )}
      >
        <Icon className="icon-pop h-4 w-4 shrink-0" />
        <span className="sidebar-fade min-w-0 flex-1 truncate">{label}</span>
        {trailing && <span className="sidebar-fade">{trailing}</span>}
      </button>
    </RailTip>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="sidebar-label sidebar-fade whitespace-nowrap px-3 pb-1.5 pt-5">{children}</p>;
}

function GroupToggle({ icon: Icon, label, count, isCollapsed, onToggle, controls }: {
  icon?: LucideIcon;
  label: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      aria-controls={controls}
      className="sidebar-label group flex w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 pb-1.5 pt-5 text-left transition-colors duration-300 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
    >
      {Icon && <Icon className="h-3 w-3" />}
      <span>{label}</span>
      {isCollapsed && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
          {count}
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
  );
}

function ShowMore({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${count} more ${label.toLowerCase()} projects`}
      className="group relative mt-0.5 flex h-7 w-full shrink-0 items-center justify-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
    >
      <span aria-hidden="true" className="tracking-[0.2em] transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
        ···
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        Show more <span className="text-primary/80">+{count}</span>
        <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

const NEW_PROJECT_LABEL = "New project";
function NewProjectItem({ onClick, rail }: { onClick: () => void; rail: boolean }) {
  const plus = useRef<HTMLSpanElement>(null);

  return (
    <RailTip label="New project" rail={rail}>
      <button
        type="button"
        data-glide-none
        onClick={onClick}
        aria-label="Start a new project"
        className="sidebar-new-row group relative isolate mb-1 flex h-10 w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-[0.625rem] pl-1.5 pr-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
      >
        <SpacetimeFabric mass={plus} />
        <span ref={plus} aria-hidden="true" className="sidebar-new-plus relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
          <Plus className="icon-pop h-4 w-4" />
        </span>
        <span className="sidebar-fade sidebar-new-label relative z-[1] min-w-0 flex-1 truncate text-[13.5px] font-medium">{NEW_PROJECT_LABEL}</span>
      </button>
    </RailTip>
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
    <div className="flex h-8 items-center gap-3 rounded-lg bg-background px-3 ring-1 ring-inset ring-primary/60">
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
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground caret-primary outline-none"
      />
    </div>
  );
}

function ProjectItem({ project, isCurrent, isRenaming, onOpen, onStartRename, onRenameDone, actions }: {
  project: ProjectSummaryResponse;
  isCurrent: boolean;
  isRenaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onRenameDone: (name: string | null) => void;
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
          data-glide
          aria-current={isCurrent ? "page" : undefined}
          onClick={onOpen}
          className={cn(
            "group/row",
            ROW_CLASS,
            "pr-8",
            isCurrent ? "font-medium text-foreground" : "text-foreground/70 hover:text-foreground"
          )}
        >
          <span
            className="h-4 w-4 shrink-0 rounded-[5px] ring-1 ring-inset ring-white/15 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={generateGradient(project.name)}
          />
          <OverflowSlideText text={project.name} />
        </button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${project.name}`}
            className={cn(
              "absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-300 hover:bg-primary/15 hover:text-primary focus-visible:opacity-100 group-hover/item:opacity-100 data-[state=open]:bg-primary/15 data-[state=open]:text-primary data-[state=open]:opacity-100",
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
                data-danger="delete"
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

function ProjectSection({ icon, label, projects, limit = SECTION_LIMIT, isCollapsed, onToggle, renderProjects, onShowMore }: {
  icon?: LucideIcon;
  label: string;
  projects: ProjectSummaryResponse[];
  limit?: number;
  isCollapsed: boolean;
  onToggle: () => void;
  renderProjects: (projects: ProjectSummaryResponse[]) => ReactNode;
  onShowMore: () => void;
}) {
  if (projects.length === 0) return null;
  const hiddenCount = projects.length - limit;
  const contentId = `sidebar-section-${label.toLowerCase()}`;

  return (
    <div>
      <GroupToggle icon={icon} label={label} count={projects.length} isCollapsed={isCollapsed} onToggle={onToggle} controls={contentId} />
      <div
        id={contentId}
        ref={setInert(isCollapsed)}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {renderProjects(projects.slice(0, limit))}
          {hiddenCount > 0 && <ShowMore count={hiddenCount} label={label} onClick={onShowMore} />}
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
      <GroupToggle label={label} count={projects.length} isCollapsed={isCollapsed} onToggle={onToggle} controls={contentId} />
      {!isCollapsed && (
        <div id={contentId} className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="px-3 py-1 text-xs text-muted-foreground">{emptyMessage}</p>
          ) : (
            <>
              {renderProjects(projects.slice(0, limit))}
              {hiddenCount > 0 && <ShowMore count={hiddenCount} label={label} onClick={onShowMore} />}
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
    <div className="sidebar-fold">
      <div>
        <div
          className={cn(
            "app-rise mb-2 rounded-xl border px-2.5 py-2",
            quota.isExhausted ? "border-destructive/40 bg-destructive/10" : "border-primary/25 bg-primary/[0.07]"
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

          {quota.isExhausted ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
              <div className="h-full rounded-full bg-destructive" style={{ width: `${quota.percent}%` }} />
            </div>
          ) : (
            <div className="app-progress mt-2">
              <div className="app-progress-fill" style={{ width: `${quota.percent}%` }} />
            </div>
          )}

          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">Refills in {formatResetIn(quota.resetsAt)}.</p>

          {subscription?.isFree !== false && (
            <button type="button" onClick={onUpgrade} className="mt-1.5 text-[11px] font-medium text-primary transition-colors hover:underline">
              Upgrade for more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SidebarPanel({ currentProjectId, collapsed, onNavigate }: SidebarPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
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

  const filter = new URLSearchParams(location.search).get("filter");
  const isAt = (path: string, wanted: string | null = null) => location.pathname === path && filter === wanted;

  const actions = useProjectActions({
    onDeleted: (project) => {
      if (String(project.id) === currentProjectId) go("/projects");
    },
  });

  const paletteToggleRef = useRef(() => setIsPaletteOpen(!isPaletteOpen));
  paletteToggleRef.current = () => setIsPaletteOpen(!isPaletteOpen);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteToggleRef.current();
      }
    };
    const handleOpenSearch = () => setIsPaletteOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    };
  }, []);

  const finishRename = (project: ProjectSummaryResponse, name: string | null) => {
    setRenamingId(null);
    if (name) actions.renameProject(project, name);
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const glideRef = useGlideHighlight(panelRef);
  const activeRef = useActivePill(panelRef, `${location.pathname}${location.search}|${currentProjectId ?? ""}`);

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
          onStartRename={() => setRenamingId(project.id)}
          onRenameDone={(name) => finishRename(project, name)}
          actions={actions}
        />
      ))}
    </ul>
  );

  return (
    <div ref={panelRef} className="relative flex h-full min-h-0 flex-col">
      <span ref={activeRef} aria-hidden="true" className="active-pill" />
      <span ref={glideRef} aria-hidden="true" className="glide-pill" />
      <nav className="space-y-0.5 px-3 pt-1">
        <NewProjectItem rail={collapsed} onClick={() => go("/projects?new=1")} />
        <NavItem
          icon={Search}
          label="Search"
          rail={collapsed}
          motion="rotate(-14deg) scale(1.12)"
          onClick={() => setIsPaletteOpen(true)}
          trailing={<kbd className="sidebar-kbd px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{SEARCH_SHORTCUT}</kbd>}
        />
        <NavItem
          icon={LayoutDashboard}
          label="Dashboard"
          rail={collapsed}
          active={isAt("/projects")}
          motion="scale(1.14)"
          onClick={() => go("/projects")}
        />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2">
        <div className="shrink-0 space-y-0.5">
          <SectionLabel>Projects</SectionLabel>
          <NavItem
            icon={LayoutGrid}
            label="All projects"
            rail={collapsed}
            active={isAt("/projects/all")}
            motion="rotate(90deg) scale(1.08)"
            onClick={() => go("/projects/all")}
          />
          <NavItem
            icon={User}
            label="Owned by me"
            rail={collapsed}
            active={isAt("/projects/all", "owned")}
            motion="scale(1.08)"
            onClick={() => go("/projects/all?filter=owned")}
          />
          <NavItem
            icon={Users}
            label="Shared with me"
            rail={collapsed}
            active={isAt("/projects/all", "shared")}
            motion="scale(1.08)"
            onClick={() => go("/projects/all?filter=shared")}
          />
        </div>

        <div ref={setInert(collapsed)} className="sidebar-fade flex min-h-0 flex-1 flex-col">
          {!isLoading && !isError && (
            <div className="shrink-0">
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
            </div>
          )}

          {isLoading ? (
            <>
              <SectionLabel>Recent</SectionLabel>
              <div className="space-y-2.5 px-3 py-1">
                {[70, 55, 62].map((width) => (
                  <div key={width} className="flex items-center gap-3">
                    <div className="app-skeleton h-4 w-4 rounded-[5px]" />
                    <div className="app-skeleton h-3 rounded" style={{ width: `${width}%` }} />
                  </div>
                ))}
              </div>
            </>
          ) : isError ? (
            <p className="px-3 pt-4 text-xs text-muted-foreground">Couldn&rsquo;t load projects</p>
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
      </div>

      <div className="border-t border-white/[0.07] p-3">
        {!currentProjectId && <UsageMeter onUpgrade={() => go("/pricing")} />}

        <DropdownMenu>
          <RailTip label={userInfo?.name || "Account"} rail={collapsed}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-glide
                style={iconMotion("scale(1.15)")}
                className="group relative flex h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 data-[state=open]:bg-primary/10"
              >
                <span className="avatar-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground">
                  {initial}
                </span>
                <span className="sidebar-fade min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{userInfo?.name || "Signed in"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{userInfo?.username}</span>
                </span>
                <ChevronsUpDown className="icon-pop sidebar-fade h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </button>
            </DropdownMenuTrigger>
          </RailTip>
          <DropdownMenuContent
            side={collapsed ? "right" : "top"}
            align={collapsed ? "end" : "start"}
            className={cn("min-w-[220px]", !collapsed && "w-[var(--radix-dropdown-menu-trigger-width)]")}
          >
            <DropdownMenuItem onClick={() => go("/usage")} data-current={location.pathname === "/usage"}>
              <BarChart3 />
              Usage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/billing")} data-current={location.pathname === "/settings/billing"}>
              <CreditCard />
              Plans &amp; billing
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/security")} data-current={location.pathname === "/settings/security"}>
              <ShieldCheck />
              Security
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-danger="">
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectCommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} projects={projects ?? []} onNavigate={go} />
      {actions.deleteDialog}
      {actions.forkDialog}
    </div>
  );
}
