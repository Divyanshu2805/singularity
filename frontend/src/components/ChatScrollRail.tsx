import { useEffect, useRef, useState } from "react";
import { MAX_RAIL_TICKS } from "@/lib/chat-rail";
import { OverflowSlideText } from "@/components/OverflowSlideText";
import { cn } from "@/lib/utils";

export interface ScrollRailItem {
  id: string;
  label: string;
}

// Crossing the small gap between the ticks and the list shouldn't close it.
const CLOSE_DELAY_MS = 150;

/**
 * The Claude-style way through a long chat: a short tick for every message you sent, pinned to the top left.
 * The current one is longer and brighter. Hovering (or focusing) opens the list of those messages, with the
 * current one highlighted; picking one scrolls to it.
 */
export function ChatScrollRail({ items, activeIndex, onSelect }: {
  items: readonly ScrollRailItem[];
  /** Index into `items` of the message being read, or -1 for none. */
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const open = () => {
    window.clearTimeout(closeTimerRef.current);
    setIsOpen(true);
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  // A long list opens scrolled to where you are, not to the top.
  useEffect(() => {
    if (!isOpen) return;
    // Optional-called: jsdom (the test environment) doesn't implement scrollIntoView.
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen]);

  const active = Math.min(Math.max(activeIndex, -1), items.length - 1);
  const anchor = active < 0 ? items.length - 1 : active;
  const start = items.length <= MAX_RAIL_TICKS
    ? 0
    : Math.min(Math.max(0, anchor - Math.floor(MAX_RAIL_TICKS / 2)), items.length - MAX_RAIL_TICKS);
  const ticks = items.slice(start, start + MAX_RAIL_TICKS);

  return (
    <div
      className="absolute left-0 top-2 z-20 flex items-start"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setIsOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Jump to one of your messages"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((value) => !value)}
        className="flex flex-col gap-[5px] rounded-md py-2 pl-2.5 pr-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
      >
        {ticks.map((item, offset) => (
          <span
            key={item.id}
            data-rail-tick=""
            aria-hidden="true"
            className={cn(
              "block h-[2px] rounded-full transition-all duration-150",
              start + offset === active ? "w-4 bg-foreground" : "w-2.5 bg-muted-foreground/40"
            )}
          />
        ))}
      </button>

      {isOpen && (
        <div
          ref={listRef}
          role="menu"
          aria-label="Your messages"
          className="ml-0.5 mt-0.5 max-h-[min(24rem,60vh)] w-72 max-w-[calc(100vw-4rem)] overflow-y-auto rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {items.map((item, index) => {
            const isActive = index === active;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  onSelect(index);
                  setIsOpen(false);
                }}
                // `group/row` is what OverflowSlideText watches to start gliding a label that doesn't fit.
                className={cn(
                  "group/row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                  isActive ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-[2px] w-2.5 shrink-0 rounded-full", isActive ? "bg-foreground" : "bg-muted-foreground/50")}
                />
                {/* A message can be long, so the label reads to the end on hover rather than stopping at an
                    ellipsis - the same treatment a long project name gets in the app sidebar. */}
                <OverflowSlideText text={item.label} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
