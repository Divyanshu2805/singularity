/**
 * The app sidebar, and the spacer that reserves its width.
 *
 * Handles: the open panel and the closed icon rail as one element whose width animates between them, the head (the
 * logo, the name and the close button), the rail's open control, and - on a narrow screen, where the open panel lies
 * over the page - the scrim that closes it and closing it again after a navigation.
 *
 * Its open and close follow the owner's BitBin sidebar, which is Claude's: the width slides, the icons never move
 * (each sits on the rail's centre line, open or closed), the labels fade and slip a few pixels left as it closes and
 * come back just after it opens (index.css, .sidebar-fade), and a few blocks fold away entirely (.sidebar-fold). Open,
 * the head reads mark, name, close button; closed, the name and the button fade with the labels and the mark itself
 * becomes the open control - hovering or focusing it swaps the horizon mark for an open-panel icon. Both panel icons
 * act out the click on hover (.panel-anim: the divider and the arrow lean the way the panel will go). The name builds
 * itself each time the panel opens (BrandName's drawn), and closed controls name themselves in a tooltip.
 *
 * The spacer is what makes opening slide the page over rather than jump it; it and the panel share one width
 * transition. On a narrow screen the spacer stays rail-wide and the open panel overlays the page over a scrim.
 *
 * The rail's content is still laid out wider than the rail (the head keeps the name and the close button), so the
 * panel clips rather than hides its overflow: an overflow-hidden box can still be scrolled sideways by the browser -
 * bringing a focused, faded control into view - and the rail then showed the clipped right-hand ends of the open
 * panel ("Ctrl K", the close button, a sliver of the active row) instead of its icons.
 *
 * A page that sets its content in a rounded inset panel, as Lovable does (the dashboard), passes inset: the sidebar
 * then drops its own surface and hairline and stands on the page's plain surround, so the panel's rounded edge is the
 * one line between them. Otherwise it is a faint tint over the app's sky - see-through, as BitBin's is, so the sky runs
 * on beneath it and the two read as one surface - parted from the page by a hairline (.app-sidebar).
 */
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { SidebarPanel } from "@/components/ProjectSidebar";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isNarrowScreen, type SidebarController } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

const SIDEBAR_MOTION = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

export function SidebarSpacer({ sidebar }: { sidebar: SidebarController }) {
  return (
    <div
      aria-hidden="true"
      className={cn("w-16 shrink-0 transition-[width]", SIDEBAR_MOTION, sidebar.isExpanded && "md:w-64")}
    />
  );
}

export function AppSidebar({
  sidebar,
  currentProjectId,
  inset = false,
}: {
  sidebar: SidebarController;
  currentProjectId?: string;
  inset?: boolean;
}) {
  const { isExpanded, toggle, collapse } = sidebar;
  const closeIfOverlaying = () => {
    if (isNarrowScreen()) collapse();
  };

  return (
    <>
      {isExpanded && (
        <button
          type="button"
          aria-label="Close sidebar"
          tabIndex={-1}
          onClick={collapse}
          className="app-fade fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      <aside
        aria-label="Sidebar"
        data-collapsed={!isExpanded}
        className={cn(
          "app-sidebar absolute inset-y-0 left-0 z-40 flex flex-col overflow-clip transition-[width,box-shadow]",
          SIDEBAR_MOTION,
          isExpanded ? "w-64 max-md:shadow-2xl max-md:shadow-black/60" : "w-16",
          inset ? "app-sidebar-inset" : "border-r border-white/[0.07]"
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <div className="group/logo relative flex h-10 w-10 shrink-0 items-center justify-center">
            <HorizonMark
              drawn
              className="pointer-events-none h-7 w-7 transition-opacity duration-150 group-has-[button:hover]/logo:opacity-0 group-has-[button:focus-visible]/logo:opacity-0"
            />
            {isExpanded ? (
              <Link
                to="/projects"
                aria-label="Singularity dashboard"
                onClick={closeIfOverlaying}
                className="absolute inset-0 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              />
            ) : (
              <Tooltip delayDuration={120}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label="Open sidebar"
                    className="absolute inset-0 flex items-center justify-center rounded-lg text-primary opacity-0 outline-none transition-opacity duration-150 hover:bg-primary/10 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-primary/50"
                  >
                    <PanelLeftOpen className="panel-anim h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="text-xs">
                  Open sidebar
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <Link
            to="/projects"
            tabIndex={-1}
            aria-hidden="true"
            onClick={closeIfOverlaying}
            className="sidebar-fade min-w-0"
          >
            <BrandName drawn={isExpanded} className="text-[19px]" />
          </Link>

          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                tabIndex={isExpanded ? undefined : -1}
                aria-label="Close sidebar"
                className="sidebar-fade ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <PanelLeftClose className="panel-anim h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="text-xs">
              Close sidebar
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="min-h-0 flex-1">
          <SidebarPanel currentProjectId={currentProjectId} collapsed={!isExpanded} onNavigate={closeIfOverlaying} />
        </div>
      </aside>
    </>
  );
}
