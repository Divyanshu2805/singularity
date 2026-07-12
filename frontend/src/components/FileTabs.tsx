import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { getFileColor, getFileIcon, splitPath } from "@/lib/file-icons";
import { cn } from "@/lib/utils";

interface FileTabsProps {
  openTabs: string[];
  activeTab: string | null;
  /** Paths with AI changes still pending review - marked with a dot. */
  changedPaths?: ReadonlySet<string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  /** Left-aligned control(s) that stay put before the tabs, e.g. the files-panel toggle. */
  leading?: ReactNode;
  /** Right-aligned controls that stay put while the tabs scroll. */
  actions?: ReactNode;
}

export function FileTabs({ openTabs, activeTab, changedPaths, onSelectTab, onCloseTab, leading, actions }: FileTabsProps) {
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-border/60 bg-background">
      {leading}
      <div role="tablist" className="tabs-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
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
                "group relative flex min-w-0 max-w-[200px] shrink-0 cursor-pointer select-none items-center gap-2 border-r border-border/50 pl-3 pr-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-primary"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5 transition-colors",
                  isActive ? "bg-primary" : "bg-transparent group-hover:bg-primary/50"
                )}
              />
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(path);
                  }}
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-primary/15 hover:text-primary focus-visible:opacity-100",
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
