import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, CodeXml, Eye, Loader2, Lock, PenLine, RotateCcw, Sparkles, Square, Terminal, Zap } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { findSafeEnd, findVisibleRanges, useStreamParser } from "@/hooks/use-stream-parser";
import { useSmoothStream } from "@/hooks/use-smooth-stream";
import { AssistantError, AssistantEvents } from "./ChatEventRenderer";
import { TeachingModeToggle } from "./TeachingModeToggle";
import { MessageActions } from "./MessageActions";
import { assistantTurnText } from "@/lib/chat-export";

/** The backend stores this string in `ChatMessage.content` for every assistant turn; its events are the record. */
const SAVED_ASSISTANT_PLACEHOLDER = "Assistant Message here...";
import { ChatScrollRail } from "./ChatScrollRail";
import { messageLabel } from "@/lib/chat-rail";
import { ChatEvent, ProjectRole } from "@/lib/types";
import type { CodeTarget } from "@/lib/lesson";
import { cn, formatWorkedFor, generateGradient } from "@/lib/utils";

// Module-level so the array/object references stay stable across renders.
const EMPTY_STATE_SUGGESTIONS = [
  "build a landing page for a SaaS product",
  "create a todo app with drag and drop",
  "add a dark mode toggle to the navbar",
];
// For someone opening a project that was shared with them: getting oriented comes before building.
const SHARED_PROJECT_STARTERS = [
  {
    label: "Explain how this project is built",
    prompt: "Give me a quick tour of this project: what it does, how the code is organised, and which files matter most.",
  },
  {
    label: "Suggest what to improve next",
    prompt: "Look through this project and suggest the three most valuable improvements I could make next.",
  },
];
const STREAM_OPTIONS = { visibleRanges: findVisibleRanges, safeEnd: findSafeEnd };
const MAX_INPUT_HEIGHT = 200;
// How long a message stays lit up after jumping to it.
const JUMP_HIGHLIGHT_MS = 1400;
// Longest a smooth jump is expected to take; scroll events before this are ours, not the reader's.
const JUMP_SCROLL_MS = 1200;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  createdAt?: string;
  /** Seconds the response took, measured in the browser - stands in for the server's `THOUGHT` event until it lands. */
  thoughtSeconds?: number;
  /** Files the answer listed as steps but never wrote - a build cut short ends cleanly, with no error. */
  unfinishedSteps?: number;
  /** The request was refused before any response began (e.g. out of quota) - nothing ran, so it can just be sent again. */
  notSent?: boolean;
  /** The reader pressed Stop, so this answer is deliberately incomplete rather than broken. */
  wasStopped?: boolean;
  /**
   * Leading characters of `content` to show at once rather than type out: what a reattached page receives in one go
   * after a refresh, which the reader was already looking at before it. Only new text after it animates.
   */
  instantLength?: number;
  events?: ChatEvent[]; // Structured events from the database
  editedFiles?: string[];
  error?: string;
}

/** Set when the project belongs to someone else, so an empty chat welcomes the collaborator instead. */
export interface SharedProjectInfo {
  projectName: string;
  ownerName?: string;
  role: ProjectRole;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isStreaming: boolean;
  isLoading?: boolean;
  readOnly?: boolean;
  /**
   * Set once today's AI allowance is spent. The composer is replaced rather than merely disabled: a greyed-out
   * box with no explanation reads as the app being broken, which is exactly the wrong impression at the moment
   * someone might otherwise pay.
   */
  quotaBlock?: { message: string; resetsIn: string; onUpgrade: () => void } | null;
  /** Rendered just above the composer - the page's token meter. Left out for view-only members, who can't send. */
  usageMeter?: ReactNode;
  /**
   * `isFromCurrentChat` is true only for files from the latest live response, which may still have a diff to show.
   * `target` is set when a teaching-mode walkthrough points at a particular line.
   */
  onOpenFile?: (path: string, isFromCurrentChat: boolean, target?: CodeTarget) => void;
  sharedWith?: SharedProjectInfo | null;
  onBrowseCode?: () => void;
  /** Aborts the response in flight - the composer's send button becomes Stop while one is running. */
  onStop?: () => void;
  /** Sends the last message again, for an answer that was stopped, failed, or ran out of room mid-plan. */
  onRetry?: () => void;
  /** Applies from the next message sent; lessons already in the chat stay put whichever way it's set. */
  teachingMode?: boolean;
  onTeachingModeChange?: (enabled: boolean) => void;
}

function useIsIdle(signal: unknown, delayMs: number, enabled: boolean) {
  const [isIdle, setIsIdle] = useState(false);
  useEffect(() => {
    setIsIdle((prev) => (prev ? false : prev));
    if (!enabled) return;
    const timeout = setTimeout(() => setIsIdle(true), delayMs);
    return () => clearTimeout(timeout);
  }, [signal, delayMs, enabled]);
  return isIdle;
}

const resizeTextarea = (el: HTMLTextAreaElement) => {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
};

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 items-center rounded border border-border/80 bg-muted/40 px-1 font-mono text-[10px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

export function ChatPanel({
  messages,
  onSendMessage,
  isStreaming,
  quotaBlock,
  usageMeter,
  isLoading,
  readOnly,
  onStop,
  onRetry,
  onOpenFile,
  sharedWith,
  onBrowseCode,
  teachingMode,
  onTeachingModeChange,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // The token re-triggers the highlight even when jumping to the same message twice.
  const [highlight, setHighlight] = useState<{ id: string; token: number } | null>(null);
  // 1-based position among your messages, shown in the jump control; 0 when none is current.
  const [jumpPosition, setJumpPosition] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPinnedRef = useRef(true);
  const observerRef = useRef<ResizeObserver | null>(null);
  // The message the last jump landed on. Jumps step from this index, not from what happens to be on screen:
  // messages near the end can never scroll to the top of the view, so screen-based stepping got stuck on them.
  const activeJumpRef = useRef<number | null>(null);
  const isJumpScrollingRef = useRef(false);
  const jumpScrollTimerRef = useRef<number | undefined>(undefined);

  // Files from the latest reply open with their diff (if one is still unseen); older replies always open full content.
  // Diffs only exist in memory for this session, so after a refresh the latest reply opens full content too.
  const currentChatMessageId = [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null;
  const userMessageIds = useMemo(() => messages.filter((message) => message.role === "user").map((message) => message.id), [messages]);
  const railItems = useMemo(
    () => messages.filter((message) => message.role === "user").map((message) => ({ id: message.id, label: messageLabel(message.content) })),
    [messages]
  );
  const hasRail = !isLoading && railItems.length > 1;

  /** Scroll offset of one of your messages within the chat, or null if it isn't rendered. */
  const userMessageTop = (index: number) => {
    const container = scrollRef.current;
    const id = userMessageIds[index];
    const el = id ? container?.querySelector<HTMLElement>(`[data-user-message="${CSS.escape(id)}"]`) : null;
    if (!container || !el) return null;
    return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  };

  /** The last of your messages that starts at or above a point a third of the way down the view; -1 if none. */
  const nearestUserMessageIndex = () => {
    const container = scrollRef.current;
    if (!container) return -1;
    const probe = container.scrollTop + container.clientHeight / 3;
    let nearest = -1;
    userMessageIds.forEach((_, index) => {
      const top = userMessageTop(index);
      if (top !== null && top <= probe) nearest = index;
    });
    return nearest;
  };

  // Follow new content only while the reader is already at the bottom - scrolling up to
  // re-read something shouldn't get yanked back down by the next streamed line.
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && isPinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const lastScrollTopRef = useRef(0);
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Only a scroll *up* unpins. Our own scroll-to-bottom can report "not at bottom" when more
    // streamed content lands before its scroll event fires, which must not stop the follow.
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 64) isPinnedRef.current = true;
    else if (el.scrollTop < lastScrollTopRef.current) isPinnedRef.current = false;
    lastScrollTopRef.current = el.scrollTop;
    setShowJumpToLatest(!isPinnedRef.current);

    // Scrolling by hand means the reader has moved on from the last jump; the next jump starts from the screen.
    if (!isJumpScrollingRef.current) {
      activeJumpRef.current = null;
      // At the bottom the latest message is "current", even though it can never reach the top of the view.
      setJumpPosition(isPinnedRef.current ? userMessageIds.length : nearestUserMessageIndex() + 1);
    }
  };

  const markJumpScrolling = () => {
    isJumpScrollingRef.current = true;
    window.clearTimeout(jumpScrollTimerRef.current);
    jumpScrollTimerRef.current = window.setTimeout(() => {
      isJumpScrollingRef.current = false;
    }, JUMP_SCROLL_MS);
  };

  // A smooth scroll ends with `scrollend` where supported; the timer above covers browsers without it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScrollEnd = () => {
      window.clearTimeout(jumpScrollTimerRef.current);
      isJumpScrollingRef.current = false;
    };
    el.addEventListener("scrollend", handleScrollEnd);
    return () => {
      el.removeEventListener("scrollend", handleScrollEnd);
      window.clearTimeout(jumpScrollTimerRef.current);
    };
  }, []);

  const scrollToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    isPinnedRef.current = true;
    // "Just past the last message": the next Alt+↑ lands on your latest message, Alt+↓ stays put.
    activeJumpRef.current = userMessageIds.length;
    markJumpScrolling();
    setJumpPosition(userMessageIds.length > 0 ? userMessageIds.length : 0);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const scrollToUserMessage = (index: number) => {
    const container = scrollRef.current;
    const top = userMessageTop(index);
    if (!container || top === null) return;
    isPinnedRef.current = false;
    activeJumpRef.current = index;
    markJumpScrolling();
    container.scrollTo({ top: Math.max(0, top - 12), behavior: "smooth" });
    setJumpPosition(index + 1);
    setHighlight({ id: userMessageIds[index], token: Date.now() });
  };

  /** Steps one of your messages back (-1) or forward (1). Past the last one, returns to the bottom of the chat. */
  const jumpToUserMessage = (direction: -1 | 1) => {
    const count = userMessageIds.length;
    if (count === 0) return;

    // Resting at the bottom of the chat (where it normally sits) counts as just past the last message,
    // so this doesn't depend on measuring the screen at all.
    const current = activeJumpRef.current ?? (isPinnedRef.current ? count : null);

    let target: number;
    if (current !== null) {
      target = current + direction;
    } else {
      // First jump after reading freely: start from whichever message is nearest the top of the view.
      const container = scrollRef.current;
      const nearest = nearestUserMessageIndex();
      if (direction === 1) {
        target = nearest + 1;
      } else if (nearest === -1) {
        target = 0;
      } else {
        const top = userMessageTop(nearest) ?? 0;
        // If that message already sits at the top, "previous" means the one before it.
        const isAlreadyAtTop = container ? Math.abs(top - 12 - container.scrollTop) < 24 : false;
        target = isAlreadyAtTop ? nearest - 1 : nearest;
      }
    }

    if (target >= count) {
      scrollToLatest();
      return;
    }
    scrollToUserMessage(Math.max(0, target));
  };

  useEffect(() => {
    if (!highlight) return;
    const timeout = setTimeout(() => setHighlight(null), JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timeout);
  }, [highlight]);

  // Alt+↑ / Alt+↓ anywhere on the page (except inside the code editor, which has its own use for them).
  const jumpRef = useRef(jumpToUserMessage);
  jumpRef.current = jumpToUserMessage;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      if ((e.target as HTMLElement | null)?.closest?.(".cm-editor")) return;
      e.preventDefault();
      jumpRef.current(e.key === "ArrowUp" ? -1 : 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // New messages change the numbering, so a remembered jump position no longer means the same message.
  useEffect(() => {
    activeJumpRef.current = null;
    setJumpPosition(userMessageIds.length);
  }, [userMessageIds.length]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || readOnly || quotaBlock) return;

    isPinnedRef.current = true;
    onSendMessage(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTextarea(e.target);
  };

  const applySuggestion = (text: string) => {
    setInput(text);
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => {
      resizeTextarea(el);
      el.setSelectionRange(text.length, text.length);
    });
  };

  const canSend = input.trim().length > 0 && !isStreaming && !quotaBlock;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            sharedWith ? (
              <SharedProjectWelcome info={sharedWith} readOnly={readOnly} onPick={applySuggestion} onBrowseCode={onBrowseCode} />
            ) : (
              <EmptyState readOnly={readOnly} onPick={applySuggestion} />
            )
          ) : (
            <div ref={contentRef} className={cn("flex flex-col gap-6 py-5 pr-4", hasRail ? "pl-9" : "pl-4")}>
              {messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage
                    key={message.id}
                    message={message}
                    highlightToken={highlight?.id === message.id ? highlight.token : null}
                    // Editing puts the text back in the composer to change and send again. It appends a new
                    // turn rather than rewriting the old one: the transcript is persisted server-side and is
                    // the record of what was actually built, so silently rewriting history would misreport it.
                    onEdit={!readOnly && !isStreaming ? applySuggestion : undefined}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    isStreaming={isStreaming && !!message.isStreaming}
                    onRetry={!readOnly && !isStreaming && message.id === currentChatMessageId ? onRetry : undefined}
                    onOpenFile={
                      onOpenFile ? (path, target) => onOpenFile(path, message.id === currentChatMessageId, target) : undefined
                    }
                  />
                )
              )}
            </div>
          )}
        </div>

        {showJumpToLatest && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Jump to latest message"
            className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {/* A tick per message you sent; hover for the list, click to jump. Alt+↑ / Alt+↓ still steps through them. */}
        {hasRail && <ChatScrollRail items={railItems} activeIndex={jumpPosition - 1} onSelect={scrollToUserMessage} />}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1">
        {!readOnly && usageMeter}
        {readOnly ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            You have view-only access to this project
          </div>
        ) : quotaBlock ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">{quotaBlock.message}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Your allowance refills in {quotaBlock.resetsIn}.
                </p>
              </div>
              <Button size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={quotaBlock.onUpgrade}>
                Upgrade
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="group rounded-2xl border border-border bg-card px-2 pb-2 pt-1.5 shadow-[0_10px_30px_-18px_rgb(0_0_0/0.7)] transition-[border-color,box-shadow] duration-150 hover:border-primary/35 focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.12),0_10px_30px_-18px_rgb(0_0_0/0.7)]"
          >
            <div className="flex items-start gap-2 px-1.5">
              {/* Terminal-style prompt that lights up while you type */}
              <span
                aria-hidden="true"
                className="select-none py-1 text-base font-semibold leading-6 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
              >
                ›
              </span>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                rows={2}
                aria-label="Message VibeCraft"
                placeholder={
                  isStreaming ? "Draft your next message while VibeCraft works…" : "Ask VibeCraft to build or change something…"
                }
                className="min-h-[52px] flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-sm leading-6 caret-primary shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pl-2">
              {isStreaming ? (
                <span className="flex min-w-0 items-center gap-2 text-xs">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  <span className="text-shimmer truncate">Working on it…</span>
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground/80">
                  <Kbd>↵</Kbd> send
                  <span aria-hidden="true" className="text-border">·</span>
                  <Kbd>⇧ ↵</Kbd> new line
                  {userMessageIds.length > 1 && (
                    <span className="hidden items-center gap-1.5 xl:flex">
                      <span aria-hidden="true" className="text-border">·</span>
                      <Kbd>Alt ↑↓</Kbd> jump
                    </span>
                  )}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {onTeachingModeChange && <TeachingModeToggle enabled={!!teachingMode} onChange={onTeachingModeChange} />}
                {/* While a response is running the same spot stops it, rather than sitting there disabled:
                    a long build is exactly when you want a way out of it. */}
                {isStreaming && onStop ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={onStop}
                    aria-label="Stop generating"
                    title="Stop generating"
                    className="h-8 w-8 shrink-0 rounded-lg transition-transform active:scale-95"
                  >
                    <Square className="fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!canSend}
                    aria-label="Send message"
                    className="h-8 w-8 shrink-0 rounded-lg transition-transform active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                  >
                    <ArrowUp />
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function EmptyState({ readOnly, onPick }: { readOnly?: boolean; onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
        <Terminal className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-sm font-semibold">{readOnly ? "No conversation yet" : "What should we build?"}</h3>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {readOnly
          ? "Changes made by editors of this project will show up here."
          : "Describe a feature, a fix, or a whole new page."}
      </p>
      {!readOnly && (
        <div className="mt-5 flex max-w-sm flex-wrap justify-center gap-2">
          {EMPTY_STATE_SUGGESTIONS.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onPick(text)}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STARTER_ROW =
  "group flex w-full items-center gap-2.5 rounded-lg border border-border/80 bg-card/60 px-3 py-2.5 text-left text-xs text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** What a collaborator sees on a shared project nobody has chatted in yet: whose it is, what they can do, where to start. */
function SharedProjectWelcome({ info, readOnly, onPick, onBrowseCode }: {
  info: SharedProjectInfo;
  readOnly?: boolean;
  onPick: (text: string) => void;
  onBrowseCode?: () => void;
}) {
  const projectInitial = info.projectName.charAt(0).toUpperCase() || "P";

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-5">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-semibold text-white shadow-lg shadow-black/40 ring-1 ring-inset ring-white/15"
          style={generateGradient(info.projectName)}
        >
          {projectInitial}
        </span>
        {info.ownerName && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground"
          >
            {info.ownerName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {info.ownerName ? (
          <>
            <span className="font-medium text-foreground">{info.ownerName}</span> shared this project with you
          </>
        ) : (
          "This project was shared with you"
        )}
      </p>
      <h3 className="mt-1 max-w-sm truncate text-base font-semibold">{info.projectName}</h3>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        {readOnly ? <Eye className="h-3 w-3" /> : <PenLine className="h-3 w-3" />}
        {readOnly ? "You can view" : "You can edit"}
      </span>

      <p className="mt-4 max-w-xs text-xs leading-5 text-muted-foreground">
        {readOnly
          ? "There's no conversation here yet. Browse the code to see what's been built so far."
          : "Nobody has chatted here yet. Get to know the project first, or jump straight into building."}
      </p>

      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        {onBrowseCode && (
          <button type="button" onClick={onBrowseCode} className={STARTER_ROW}>
            <CodeXml className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            Browse the code
            <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        {!readOnly &&
          SHARED_PROJECT_STARTERS.map((starter) => (
            <button key={starter.label} type="button" onClick={() => onPick(starter.prompt)} className={STARTER_ROW}>
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              {starter.label}
              <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
      </div>
    </div>
  );
}

function UserMessage({ message, highlightToken, onEdit }: {
  message: ChatMessage;
  highlightToken: number | null;
  /** Puts this message back in the composer to change and send again; omitted while a response is running. */
  onEdit?: (content: string) => void;
}) {
  return (
    <div data-user-message={message.id} className="group/message flex flex-col items-end gap-0">
      <div
        // Keyed by the token so jumping to the same message again replays the highlight.
        key={highlightToken ?? "idle"}
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-primary/30 bg-primary/15 px-3.5 py-2 text-[13px] leading-6 text-foreground transition-[background-color,box-shadow] duration-500",
          highlightToken !== null && "bg-primary/25 shadow-[0_0_0_2px_hsl(var(--primary)/0.6)]"
        )}
      >
        {message.content}
      </div>
      <MessageActions
        at={message.createdAt}
        onCopy={() => message.content}
        onEdit={onEdit && (() => onEdit(message.content))}
        align="right"
        className="px-1"
      />
    </div>
  );
}

function AssistantMessage({
  message,
  isStreaming,
  onOpenFile,
  onRetry,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  onOpenFile?: (path: string, target?: CodeTarget) => void;
  /** Offered only on the latest answer, and only when it didn't get to the end of what it planned. */
  onRetry?: () => void;
}) {
  // What `ChatMessage.content` holds server-side for an assistant turn - the events are the real record. Shown
  // as if the AI had said it whenever a turn's events failed to save, so it's stripped rather than rendered.
  const content = message.content === SAVED_ASSISTANT_PLACEHOLDER ? "" : message.content || "";
  // Keyed by message id so switching projects mid-response and coming back resumes the typing
  // effect instead of restarting it - the message id is stable and globally unique for this session.
  const revealed = useSmoothStream(content, isStreaming, STREAM_OPTIONS, message.id, message.instantLength);
  const liveEvents = useStreamParser(revealed);
  const isActive = isStreaming || revealed.length < content.length;
  const isIdle = useIsIdle(revealed.length, 700, isActive);

  const hasSavedEvents = !!message.events?.length;
  const events = hasSavedEvents ? message.events! : liveEvents;
  const isDone = !isActive && !message.isStreaming;
  // A saved turn whose events are gone: say so, rather than leaving an empty bubble that reads as a lost reply.
  const isUnrecorded = isDone && !hasSavedEvents && events.length === 0 && !message.error;
  // A build that ran out of room ends cleanly, with no error - the unwritten steps are the only sign.
  const unfinished = message.unfinishedSteps ?? 0;
  const canRetry = isDone && !!onRetry && (unfinished > 0 || !!message.error || !!message.wasStopped);

  return (
    <div className="group/message flex min-w-0 flex-col gap-3">
      <AssistantEvents
        events={events}
        isStreaming={!hasSavedEvents && isActive}
        isIdle={isIdle}
        fallbackThought={message.thoughtSeconds !== undefined ? `Worked for ${formatWorkedFor(message.thoughtSeconds)}` : undefined}
        onOpenFile={onOpenFile}
      />
      {message.error && <AssistantError message={message.error} />}
      {isUnrecorded && <AssistantError message="Its chat record wasn't saved, though any files it wrote were" />}
      {canRetry && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {message.wasStopped
              ? "You stopped this answer."
              : message.notSent
                ? "Your message wasn't sent. Retry it, or use Edit on it to change it first."
                : unfinished > 0
                  ? `${unfinished} ${unfinished === 1 ? "step" : "steps"} of this plan weren't written.`
                  : "This answer didn't finish."}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border/70 px-2 text-[11.5px] text-foreground/85 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
      {/* Only once the response has settled: copying a half-written answer would put a partial file on the clipboard. */}
      {isDone && (
        <MessageActions
          at={message.createdAt}
          onCopy={() => assistantTurnText(events, message.content, message.error)}
          className="-mt-1.5"
        />
      )}
    </div>
  );
}
