/**
 * The segmented filter switch above the project list.
 *
 * Handles: the filters and their counts, and the selection pill that slides to whichever tab is active - measured
 * rather than assumed, since tabs size to their labels.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Pin, Star, type LucideIcon } from "lucide-react";
import { PROJECT_FILTERS, type ProjectFilter, type ProjectFilterCounts } from "@/lib/project-filters";
import { cn } from "@/lib/utils";

interface ProjectFilterTabsProps {
    value: ProjectFilter;
    onChange: (value: ProjectFilter) => void;
    counts: ProjectFilterCounts;
    isLoading?: boolean;
    className?: string;
}

const ICONS: Partial<Record<NonNullable<ProjectFilter>, LucideIcon>> = { pinned: Pin, starred: Star };

export function ProjectFilterTabs({ value, onChange, counts, isLoading, className }: ProjectFilterTabsProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
    const activeIndex = Math.max(0, PROJECT_FILTERS.findIndex((filter) => filter.key === value));

    useLayoutEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const place = () => {
            const tab = list.querySelectorAll<HTMLButtonElement>("[role=tab]")[activeIndex];
            if (tab) setPill({ left: tab.offsetLeft, width: tab.offsetWidth });
        };
        place();
        const observer = new ResizeObserver(place);
        list.querySelectorAll("[role=tab]").forEach((tab) => observer.observe(tab));
        return () => observer.disconnect();
    }, [activeIndex]);

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-label="Filter projects"
            className={cn(
                "tabs-scroll relative flex max-w-full shrink-0 items-center overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-0.5",
                className
            )}
        >
            {pill && (
                <span
                    aria-hidden="true"
                    className="absolute inset-y-0.5 rounded-md border border-primary/40 bg-primary/15 shadow-sm transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
                    style={{ left: pill.left, width: pill.width }}
                />
            )}
            {PROJECT_FILTERS.map(({ key, label }) => {
                const isActive = key === value;
                const Icon = key ? ICONS[key] : undefined;
                return (
                    <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(key)}
                        className={cn(
                            "relative z-10 flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        {Icon && <Icon aria-hidden="true" className="h-3 w-3" />}
                        {label}
                        <span className="min-w-[1ch] text-[10px] tabular-nums opacity-70">
                            {isLoading ? "–" : counts[key ?? "all"]}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
