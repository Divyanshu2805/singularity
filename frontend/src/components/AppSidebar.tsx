import { useRef } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { SidebarPanel } from "@/components/ProjectSidebar";
import { Logo } from "@/components/VibeCraftLogo";
import type { SidebarController, SidebarState } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

// Shared by every moving part of the sidebar so open, close, and dock stay in lockstep.
const SIDEBAR_MOTION = "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";
// A little longer than the 300ms transition, so a slide finishes before position animation is allowed again.
const SHOW_HIDE_HOLD_MS = 400;

type VisibleState = Exclude<SidebarState, "hidden">;

/** Reserves the docked sidebar's width - animating it slides the page over instead of jumping. */
export function SidebarSpacer({ sidebar }: { sidebar: SidebarController }) {
  return (
    <div
      aria-hidden="true"
      className={cn("shrink-0 transition-[width]", SIDEBAR_MOTION, sidebar.isPinned ? "w-64" : "w-0")}
    />
  );
}

/**
 * Room in a page's top bar for the sidebar toggle while the sidebar isn't pinned. The toggle itself is
 * drawn once by `AppSidebar` at a fixed spot, so it never slides around with the page.
 */
export function SidebarToggleSpace({ sidebar }: { sidebar: SidebarController }) {
  return (
    <div
      aria-hidden="true"
      className={cn("shrink-0 transition-[width]", SIDEBAR_MOTION, sidebar.isPinned ? "w-0" : "w-9")}
    />
  );
}

/**
 * One panel for every state, so hover-open, close, and pin all animate the same element:
 * hidden (slid off left) -> peek (floating card below the top bar) -> pinned (docked, full height).
 * Render it as the last child of a `relative` full-height container.
 */
export function AppSidebar({ sidebar, currentProjectId }: { sidebar: SidebarController; currentProjectId?: string }) {
  const { state, isPinned } = sidebar;
  const toggleLabel = isPinned ? "Collapse sidebar" : "Open sidebar";

  // While hidden, the panel keeps the shape it was last shown in, so showing and hiding are a pure
  // left/right slide. Only docking a floating panel (peek <-> pinned) animates its position and shape.
  // Tracked during render (not in an effect) and held for the whole transition: the page can re-render
  // mid-slide (e.g. the dashboard's rotating placeholder), and flipping back to animating position then
  // would let the panel drift vertically while it slides in.
  const motionRef = useRef<{ state: SidebarState; lastVisible: VisibleState; showHideAt: number }>({
    state,
    lastVisible: state === "pinned" ? "pinned" : "peek",
    showHideAt: Number.NEGATIVE_INFINITY,
  });
  const motion = motionRef.current;
  if (motion.state !== state) {
    if (state === "hidden" || motion.state === "hidden") motion.showHideAt = performance.now();
    motion.state = state;
  }
  if (state !== "hidden") motion.lastVisible = state;
  const layout: VisibleState = motion.lastVisible;
  const isShowingOrHiding = state === "hidden" || performance.now() - motion.showHideAt < SHOW_HIDE_HOLD_MS;

  return (
    <>
      <aside
        aria-label="Sidebar"
        aria-hidden={state === "hidden"}
        data-state={state}
        {...sidebar.panelHandlers}
        className={cn(
          "absolute z-40 flex w-64 flex-col overflow-hidden border bg-panel",
          SIDEBAR_MOTION,
          isShowingOrHiding
            ? "transition-[transform,opacity,visibility,box-shadow]"
            : "transition-[top,left,bottom,border-radius,border-color,box-shadow,transform,opacity,visibility]",
          layout === "pinned"
            ? "bottom-0 left-0 top-0 rounded-none border-y-transparent border-l-transparent border-r-border/60"
            : "bottom-2 left-2 top-[52px] rounded-xl border-border",
          state === "pinned" && "visible shadow-none",
          state === "peek" && "visible shadow-2xl shadow-black/50",
          state === "hidden" &&
            cn(
              "pointer-events-none invisible opacity-0 shadow-none",
              layout === "pinned" ? "-translate-x-full" : "-translate-x-2"
            )
        )}
      >
        {/* Brand row next to the fixed toggle - only in the docked shape; the floating panel starts below the toggle */}
        <div
          className={cn(
            "shrink-0 overflow-hidden",
            !isShowingOrHiding && cn("transition-[height]", SIDEBAR_MOTION),
            layout === "pinned" ? "h-12" : "h-0"
          )}
        >
          {/* Fixed height: the row opening only uncovers the logo, so it never travels vertically.
              The logo builds itself when the sidebar docks, and takes itself apart when it closes. */}
          <div className="flex h-12 items-center pl-12 pr-3">
            <Logo drawn={state === "pinned"} />
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarPanel
            currentProjectId={currentProjectId}
            onNavigate={sidebar.closeNow}
            onMenuOpenChange={sidebar.onMenuOpenChange}
          />
        </div>
      </aside>

      {/* Drawn once, above both the page and the sidebar, in the same spot in every state */}
      <button
        type="button"
        aria-label={toggleLabel}
        aria-expanded={state !== "hidden"}
        title={toggleLabel}
        onClick={sidebar.togglePin}
        {...sidebar.toggleHandlers}
        className={cn(
          "absolute left-2 top-2 z-50 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          sidebar.isPeekOpen && "bg-primary/15 text-primary"
        )}
      >
        {isPinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </button>
    </>
  );
}
