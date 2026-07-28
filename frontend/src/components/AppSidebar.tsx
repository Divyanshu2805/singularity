/**
 * The app sidebar, and the spacer that reserves its width.
 *
 * Handles: all three states in one panel - hidden and slid off to the left, peeking as a floating card below the top
 * bar, and pinned and docked full height - so hover-open, close and pin all animate the same element.
 *
 * The spacer is what makes docking slide the page over rather than jump it. One shared motion constant keeps the
 * panel, the spacer and the toggle in lockstep, and a short hold after a slide stops the position animation from
 * fighting it.
 */
import { useRef } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { SidebarPanel } from "@/components/ProjectSidebar";
import { Logo } from "@/components/VibeCraftLogo";
import type { SidebarController, SidebarState } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

const SIDEBAR_MOTION = "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";
const SHOW_HIDE_HOLD_MS = 400;

type VisibleState = Exclude<SidebarState, "hidden">;

export function SidebarSpacer({ sidebar }: { sidebar: SidebarController }) {
  return (
    <div
      aria-hidden="true"
      className={cn("shrink-0 transition-[width]", SIDEBAR_MOTION, sidebar.isPinned ? "w-64" : "w-0")}
    />
  );
}

export function SidebarToggleSpace({ sidebar }: { sidebar: SidebarController }) {
  return (
    <div
      aria-hidden="true"
      className={cn("shrink-0 transition-[width]", SIDEBAR_MOTION, sidebar.isPinned ? "w-0" : "w-9")}
    />
  );
}

export function AppSidebar({ sidebar, currentProjectId }: { sidebar: SidebarController; currentProjectId?: string }) {
  const { state, isPinned } = sidebar;
  const toggleLabel = isPinned ? "Collapse sidebar" : "Open sidebar";

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
        <div
          className={cn(
            "shrink-0 overflow-hidden",
            !isShowingOrHiding && cn("transition-[height]", SIDEBAR_MOTION),
            layout === "pinned" ? "h-12" : "h-0"
          )}
        >
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
