/**
 * The segmented filter switch above the project list.
 *
 * Handles: the filters and their counts (each ticking to its number rather than jumping - CountUp), and the
 * selection pill that slides to whichever tab is active - measured rather than assumed, since tabs size to their
 * labels. A sunken track holds a raised neutral chip that slides
 * between the tabs (index.css, .app-track and .seg-pill).
 *
 * The track is two elements on purpose: the outer one scrolls sideways on a narrow screen, the inner one holds the
 * tabs and the pill and clips sideways (overflow-x: clip). The pill's left springs past its target and its width
 * settles more slowly, so on the way to the last tab its right edge briefly runs past the end of the track; in a
 * single scrolling element that counted as overflow, a scrollbar flashed in and the whole track jumped in size.
 */
import { useRef } from "react";
import { CountUp } from "@/components/CountUp";
import { useSlidingPill } from "@/hooks/use-sliding-pill";
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
    const activeIndex = Math.max(0, PROJECT_FILTERS.findIndex((filter) => filter.key === value));

    const pill = useSlidingPill(listRef, activeIndex, "[role=tab]");

    return (
        <div className={cn("app-track tabs-scroll flex max-w-full shrink-0 overflow-x-auto", className)}>
            <div
                ref={listRef}
                role="tablist"
                aria-label="Filter projects"
                className="relative flex shrink-0 items-center overflow-x-clip rounded-full p-1"
            >
                {pill && (
                    <span
                        aria-hidden="true"
                        className="seg-pill seg-slide absolute inset-y-1"
                        style={pill}
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
                                "relative z-10 flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {Icon && <Icon aria-hidden="true" className="h-3 w-3" />}
                            {label}
                            <span className="min-w-[1ch] text-[10px] tabular-nums opacity-70">
                                {isLoading ? "–" : <CountUp value={counts[key ?? "all"]} />}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
