/**
 * The row of open file tabs above the editor.
 *
 * Handles: selecting and closing a tab, marking the ones the last turn changed, and hosting whatever the panel wants
 * beside them. The strip is the editor window's lighter top band (index.css, .ws-bar). Tabs are rounded chips on it
 * that behave as the app's other switches do: one gold hover wash glides from tab to tab as in the sidebar (hooks/use-glide-highlight) and the
 * selected chip (.seg-pill) slides to the open tab (hooks/use-sliding-pill), staying one steady look while it is
 * selected - a short gold bar along the open tab's top was dropped with the sidebar's edge bar. A tab's close button
 * turns its cross a quarter as the pointer reaches it.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { useSlidingPill } from "@/hooks/use-sliding-pill";
import { getFileColor, getFileIcon, splitPath } from "@/lib/file-icons";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { cn } from "@/lib/utils";

interface FileTabsProps {
  openTabs: string[];
  activeTab: string | null;
  changedPaths?: ReadonlySet<string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  leading?: ReactNode;
  actions?: ReactNode;
}

export function FileTabs({ openTabs, activeTab, changedPaths, onSelectTab, onCloseTab, leading, actions }: FileTabsProps) {
  const activeTabRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeIndex = activeTab ? openTabs.indexOf(activeTab) : -1;
  const glideRef = useGlideHighlight(listRef);
  const pill = useSlidingPill(listRef, Math.max(0, activeIndex), "[role=tab]");

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  return (
    <div className="ws-bar flex h-11 shrink-0 items-stretch gap-1 px-1.5 py-1.5">
      {leading}
      <div
        ref={listRef}
        role="tablist"
        className="tabs-scroll relative flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto overflow-y-hidden [--gl-x:max(8rem,100%)] [--gl-y:360%]"
      >
        <span ref={glideRef} aria-hidden="true" className="glide-pill rounded-xl" />
        {pill && activeIndex >= 0 && (
          <span aria-hidden="true" className="seg-pill seg-slide absolute inset-y-0 rounded-xl [box-shadow:var(--hl-active-shadow),0_0_22px_-4px_hsl(42_100%_62%/0.32)]" style={pill} />
        )}
        {openTabs.map((path) => {
          const isActive = path === activeTab;
          const hasChanges = changedPaths?.has(path) ?? false;
          const Icon = getFileIcon(path);
          const { base } = splitPath(path);

          return (
            <div
              key={path}
              ref={isActive ? activeTabRef : undefined}
              role="tab"
              aria-selected={isActive}
              data-glide=""
              tabIndex={0}
              title={path}
              onClick={() => onSelectTab(path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(path);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(path);
                }
              }}
              className={cn(
                "group relative z-10 flex min-w-0 max-w-[200px] shrink-0 cursor-pointer select-none items-center gap-2 rounded-xl pl-3 pr-1.5 text-[13px] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                isActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", getFileColor(path))} />
              <span className="truncate">{base}</span>
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                {hasChanges && (
                  <span
                    aria-label="Has unreviewed changes"
                    className="h-1.5 w-1.5 rounded-full bg-primary transition-opacity group-hover:opacity-0"
                  />
                )}
                <button
                  type="button"
                  aria-label={`Close ${base}`}
                  style={{ "--icon-hover": "scale(0.8)" } as CSSProperties}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(path);
                  }}
                  className={cn(
                    "icon-btn absolute inset-0 rounded-md transition-[opacity,color,background-color] focus-visible:opacity-100",
                    isActive && !hasChanges ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {actions}
    </div>
  );
}
