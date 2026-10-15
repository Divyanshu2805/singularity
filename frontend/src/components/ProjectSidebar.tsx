/**
 * The sidebar panel: the project list, grouped and searchable, with everything a project row can do.
 *
 * Handles: the pinned, starred and recent groups, filtering and renaming, the per-project actions menu, creating a
 * project, the links to the dashboard, billing and settings, marking the row for the page you are on, and laying all
 * of it out for both the open panel and the closed icon rail (AppSidebar).
 *
 * A project's row opens with a small tile holding the first letter of its name, in the sidebar's own quiet glass,
 * gold on the row for the open project. The tile was a square of colour generated from the name (the dashboard's
 * cards and the project's header still use it); the owner asked for no colours here, and a column of them beside a
 * list that is otherwise two tones read as noise.
 *
 * Each row reads the project's title (lib/project-title) - a few words a model wrote for what the app is, or the
 * owner's own name for it after a rename - the same words the project's header shows, so the two never disagree. A
 * title too long for the row fades out at the edge and, while the row is hovered or focused, glides to show its end
 * and back (OverflowSlideText). Renaming edits the title.
 *
 * Above the groups there are three rows only - search, the dashboard and all projects. A "Projects" section used to
 * add Owned by me and Shared with me under All projects; both are filters on the All projects page itself, and the
 * owner asked for the one way in. The dashboard's icon is a house and all projects' a stack of folders, since two
 * grids side by side could not be told apart.
 *
 * The account menu at its foot leads to Settings - one page of boxes for the profile, preferences, security and
 * deleting the account - to Plans & billing, and to Usage (the entry for the page you are on carries the sidebar's
 * selected-row wash, .account-menu in index.css), opens the panel of
 * project invitations (InvitationsDialog) with the number waiting beside it, opens the Privacy and Terms page, and
 * signs out. On a project's page the "Couldn't load projects" card is not drawn: that page says so itself, in its own
 * words, and two notices for the one failure read as two failures. While an invitation is waiting the avatar itself
 * carries a small gold dot, so it is seen without opening the menu. The invitations are asked for when the sidebar
 * mounts, as the projects are.
 *
 * Its rows follow the owner's BitBin sidebar: Inter at 13.5px, under the landing page's small mono capitals for
 * section labels (BitBin's "// projects" code-comment labels were tried and turned down), with BitBin's two gliding
 * highlights - one that follows the pointer from row to row (use-glide-highlight) and one under the row for the page
 * you are on, a nav row or the open project, which slides to the new row when you navigate (use-active-pill). Every
 * row but New project (a chip, below) is marked data-glide and positioned, so it paints over both (index.css,
 * .glide-pill, .active-pill). The selected row's pill is a solid gold fill, not a gradient. Both are the prompt's Build/Teach menu highlight - a gold wash fading rightwards with
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
 * (.sidebar-fold). Rail rows name themselves in a tooltip instead; open, the tooltips stay shut. New project is the
 * app's chip (index.css, .app-chip), the same button as the prompt's Build trigger at the owner's request: a charcoal
 * pill with a few small stars twinkling on its right (the plans' .plan-star, a few fewer on the rail) that takes the gold light following the pointer (lib/button-light, a little wider here than a chip's) and a gold hairline under it, its gold
 * plus turning a quarter; it fills the row open and narrows to a round chip on the rail, its label gone and the plus centred in
 * it by the layout, on the rail's centre line. It does not take the rows' gliding highlight (data-glide-none), since the chip lights itself the way every
 * other button in the app does. Before that it was a taller field woven from the sheet of space-time the "Continue
 * with Google" button is made of (SpacetimeFabric), and before that a few invitations typed out, a gold spill with a
 * letter-by-letter label roll, a hue-turning badge and gold stars that fell into the plus.
 *
 * When the list cannot be fetched the Recent group is a small card instead of a bare line: a cloud with a slash
 * through it, what went wrong in two short lines, and Retry, whose arrow turns while the list is asked for again.
 */
import { SpacetimeFabric } from "@/components/auth/SpacetimeFabric";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { canForkProject } from "@/lib/project-fork";
import { deleteCopy } from "@/lib/project-delete";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  ChevronsUpDown,
  BarChart3,
  Download,
  GitFork,
  Folders,
  House,
  FileText,
  LogOut,
  Mail,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings as SettingsIcon,
  Star,
  StarOff,
  Trash2,
  CreditCard,
  CloudOff,
  RotateCcw,
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
import { projectTitle } from "@/lib/project-title";
import { ProjectCommandPalette } from "@/components/ProjectCommandPalette";
import { InvitationsDialog } from "@/components/InvitationsDialog";
import { ProjectFolderIcon } from "@/components/ProjectFolderIcon";
import { useInvitations } from "@/hooks/use-invitations";
import { OPEN_INVITES_EVENT } from "@/lib/invitations-event";
import { OPEN_SEARCH_EVENT } from "@/lib/search-event";
import { useBilling } from "@/hooks/use-billing";
import { useProjectActions } from "@/hooks/use-project-actions";
import { api, getUserInfo, signOut } from "@/lib/api";
import { formatResetIn, formatTokens } from "@/lib/billing";
import { groupSidebarSections } from "@/lib/project-filters";
import type { ProjectSummaryResponse } from "@/lib/types";
import { useActivePill } from "@/hooks/use-active-pill";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

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

function NewProjectButton({ onClick, rail }: { onClick: () => void; rail: boolean }) {
  const mark = useRef<HTMLSpanElement>(null);
  return (
    <RailTip label="New project" rail={rail}>
      <button
        type="button"
        data-glide-none
        onClick={onClick}
        aria-label={rail ? "New project" : undefined}
        style={{ ...iconMotion("rotate(90deg)"), "--light-size": "9rem" } as CSSProperties}
        className={cn(
          "app-chip mb-1.5 flex h-10 items-center overflow-hidden whitespace-nowrap text-left text-[13.5px] font-medium transition-[width] duration-300 ease-out",
          rail ? "w-10 justify-center px-0" : "w-full gap-3 px-3"
        )}
      >
        <SpacetimeFabric mass={mark} />
        <span ref={mark} className="grid h-4 w-4 shrink-0 place-items-center">
          <Plus className="h-4 w-4 text-primary" />
        </span>
        {!rail && <span className="sidebar-fade min-w-0 flex-1 truncate">New project</span>}
      </button>
    </RailTip>
  );
}

function RenameField({ project, onDone }: { project: ProjectSummaryResponse; onDone: (name: string | null) => void }) {
  const title = projectTitle(project);
  const [draft, setDraft] = useState(title);
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
    onDone(save && next && next !== title ? next : null);
  };

  return (
    <div className="flex h-8 items-center gap-3 rounded-lg bg-background px-3 ring-1 ring-inset ring-primary/60">
      <input
        ref={inputRef}
        value={draft}
        maxLength={255}
        aria-label={`Rename ${title}`}
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
  const title = projectTitle(project);
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
          <ProjectFolderIcon name={project.name} isOpen={isCurrent} className="h-4 w-4" />
          <OverflowSlideText text={title} />
        </button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${title}`}
            className={cn(
              "icon-btn absolute right-1 top-1 z-10 h-6 w-6 rounded-md opacity-0 transition-[opacity,color,box-shadow,transform] duration-300 focus-visible:opacity-100 group-hover/item:opacity-100 data-[state=open]:bg-primary/15 data-[state=open]:text-primary data-[state=open]:opacity-100",
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
          {project.role && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => actions.requestDelete(project)}
                data-danger="delete"
              >
                <Trash2 />
                {deleteCopy(project.role, title).menuLabel}
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
  const [isInvitesOpen, setIsInvitesOpen] = useState(false);
  const { invitations } = useInvitations();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const sections = useCollapsedSections();
  const { data: projects, isLoading, isError, isFetching, refetch } = useQuery({
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
    const handleOpenInvites = () => setIsInvitesOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    window.addEventListener(OPEN_INVITES_EVENT, handleOpenInvites);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
      window.removeEventListener(OPEN_INVITES_EVENT, handleOpenInvites);
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
        <NewProjectButton rail={collapsed} onClick={() => go("/projects?new=1")} />
        <NavItem
          icon={Search}
          label="Search"
          rail={collapsed}
          motion="rotate(-14deg) scale(1.12)"
          onClick={() => setIsPaletteOpen(true)}
          trailing={<kbd className="sidebar-kbd px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{SEARCH_SHORTCUT}</kbd>}
        />
        <NavItem
          icon={House}
          label="Dashboard"
          rail={collapsed}
          active={isAt("/projects")}
          motion="scale(1.14)"
          onClick={() => go("/projects")}
        />
        <NavItem
          icon={Folders}
          label="All projects"
          rail={collapsed}
          active={location.pathname === "/projects/all"}
          motion="translateY(-1.5px) scale(1.08)"
          onClick={() => go("/projects/all")}
        />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2">

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
            currentProjectId ? null : (
            <div role="alert" className="chat-enter mx-1 mt-4 flex flex-col gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
                  <CloudOff className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Couldn&rsquo;t load projects</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">The server didn&rsquo;t answer. Your projects are safe.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex h-7 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] text-[11.5px] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:opacity-70"
              >
                <RotateCcw className={cn("h-3 w-3", isFetching && "animate-spin [animation-direction:reverse]")} />
                {isFetching ? "Retrying" : "Retry"}
              </button>
            </div>
            )
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
                <span className="relative shrink-0">
                  <UserAvatar name={userInfo?.name} className="h-8 w-8 text-xs" />
                  {invitations.length > 0 && (
                    <span
                      role="status"
                      aria-label={`${invitations.length} project ${invitations.length === 1 ? "invite" : "invites"} waiting`}
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-[hsl(var(--background))]"
                    />
                  )}
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
            className={cn("account-menu min-w-[220px]", !collapsed && "w-[var(--radix-dropdown-menu-trigger-width)]")}
          >
            <DropdownMenuItem onClick={() => go("/settings")} data-current={location.pathname === "/settings"}>
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/settings/billing")} data-current={location.pathname === "/settings/billing"}>
              <CreditCard />
              Plans &amp; billing
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/usage")} data-current={location.pathname === "/usage"}>
              <BarChart3 />
              Usage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsInvitesOpen(true)}>
              <Mail />
              Project invites
              {invitations.length > 0 && (
                <span aria-label={`${invitations.length} waiting`} className="ml-auto rounded-full bg-primary/20 px-1.5 text-[11px] font-medium leading-5 text-primary">
                  {invitations.length}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/privacy")}>
              <FileText />
              Privacy &amp; terms
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-danger="delete">
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectCommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} projects={projects ?? []} onNavigate={go} />
      <InvitationsDialog open={isInvitesOpen} onOpenChange={setIsInvitesOpen} />
      {actions.deleteDialog}
      {actions.forkDialog}
    </div>
  );
}
