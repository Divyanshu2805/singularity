/**
 * The project build chat: the transcript, the composer and everything around them.
 *
 * Handles: rendering saved and streaming turns, revealing a streamed answer at a readable pace, the scroll rail down
 * the side, the composer with its teaching-mode toggle and example prompts, the usage meter above it, retrying an
 * unfinished turn, the next steps suggested under a finished build, exporting the conversation, and the quota banner
 * that replaces the composer once the allowance is spent. The suggested next steps are the same cards the empty
 * conversation offers (.prompt-card), and like those they put their text in the composer to be edited or sent, not
 * straight into the conversation - they were first drawn as plain pills, which neither lit on hover nor looked
 * like anything else on the screen.
 *
 * An assistant turn carries no text of its own once saved - its events are the record - so the raw text is only used
 * while one is still streaming.
 *
 * A finished turn with nothing to show is one of two different things, told apart by thoughtSeconds, which only a live
 * turn carries (a reloaded one gets its "Worked for" line from a saved event instead): a live turn is the model
 * returning an empty completion - offered a Retry, since nothing was written - while a reloaded one means its events
 * failed to save even though any files it wrote did.
 *
 * Retry is offered on the newest turn whenever the server recorded it as anything but done - unfinished, not saved,
 * empty, failed, stopped or cut short by the daily allowance - and that record travels with the saved turn, so the
 * offer is still there after a reload. It is not offered while the quota banner is up: a retry the server would
 * refuse is not an offer.
 * While a turn is in progress the line under it says what the server is doing between pieces of the answer (reading
 * files, carrying on a reply that stopped early, saving), since those stretches used to be a bare "Working".
 *
 * It is set like the dashboard (index.css, under .dash-night): the panel is a rounded window of the workspace with a
 * low gold glow at its foot, each turn rises in as it arrives (.chat-enter), the person's turns sit in a deeper
 * gold glass (.chat-user-bubble) in white 14px text, and the composer is the dashboard's prompt - a sparkle badge
 * that brightens and turns while it has focus, white text, and the Build/Teach mode menu (PromptModeMenu) beside the
 * send button. While Singularity is
 * answering, a comet (OrbitSpinner) sits beside "Working on it" and the send button becomes a stop button, so the
 * wait reads as the app working rather than as a frozen box. The text box is a bare textarea rather than the app's
 * Textarea: that one is a field well with its own gradient fill, which painted a darker block inside the prompt. An
 * empty conversation opens on the horizon mark building itself over a soft light (index.css, .empty-glow) and the
 * dashboard's Fraunces headline (near-white, with a pale gold sweep on "build?"), with the suggestions rising in
 * turn as one column of equal-width cards (.prompt-card - an icon tile, the prompt, an arrow; well-rounded, and lit on hover by the gold light
 * that follows the pointer, as the buttons are - lib/button-light.ts) - centred pills of
 * ragged widths looked uneven, and the explanatory line under the headline was removed, both at the owner's request.
 * Teaching mode is a property of each turn, not of the panel: the menu beside the send button only decides how the
 * next message is sent, and a reply offers its lessons when it was asked for with the mode on, whatever the menu
 * says now. It used to be one switch for the whole transcript, so turning it on put a lesson under every step of
 * every earlier turn, and turning it off took them all away.
 * The person's own turns are rendered as markdown too, each single line break kept as a break - the first message of
 * a new project is the brief the idea interview wrote, and its bold labels and lists showed as raw asterisks before.
 * That brief is shown as its one "Build" sentence with the rest behind "Full brief", and any other long message is
 * folded after a few lines (lib/brief.ts): the brief used to fill the window before the answer had started.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, ChevronDown, CodeXml, Eye, ListChecks, Lock, Moon, PenLine, Rocket, RotateCcw, Sparkles, Square, Zap, type LucideIcon } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Button } from "@/components/ui/button";
import { findSafeEnd, findVisibleRanges, useStreamParser } from "@/hooks/use-stream-parser";
import { useSmoothStream } from "@/hooks/use-smooth-stream";
import { AssistantError, AssistantEvents, type StepToExplain } from "./ChatEventRenderer";
import { ChatMarkdown } from "./ChatMarkdown";
import { PromptModeMenu } from "./PromptModeMenu";
import { MessageActions } from "./MessageActions";
import { assistantTurnText } from "@/lib/chat-export";

import { ChatScrollRail } from "./ChatScrollRail";
import { messageLabel } from "@/lib/chat-rail";
import { ProjectRole } from "@/lib/types";
import { isWorthRetrying, type ChatMessage } from "@/lib/project-chat-store";
import type { CodeTarget } from "@/lib/lesson";
import { isLongMessage, splitBrief } from "@/lib/brief";
import { cn, formatWorkedFor, generateGradient } from "@/lib/utils";

const EMPTY_STATE_SUGGESTIONS: { text: string; Icon: LucideIcon }[] = [
  { text: "Build a landing page for a SaaS product", Icon: Rocket },
  { text: "Create a todo app with drag and drop", Icon: ListChecks },
  { text: "Add a dark mode toggle to the navbar", Icon: Moon },
];
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
const JUMP_HIGHLIGHT_MS = 1400;
const JUMP_SCROLL_MS = 1200;

export type { ChatMessage };

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
  quotaBlock?: { message: string; resetsIn: string; onUpgrade: () => void } | null;
  usageMeter?: ReactNode;
  onOpenFile?: (path: string, isFromCurrentChat: boolean, target?: CodeTarget) => void;
  sharedWith?: SharedProjectInfo | null;
  onBrowseCode?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onExplainStep?: (step: StepToExplain) => void;
  teachingMode?: boolean;
  projectId?: string;
  onTeachingModeChange?: (enabled: boolean) => void;
  suggestions?: readonly string[];
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
    <kbd className="sidebar-kbd inline-flex h-[18px] items-center px-1 font-sans text-[10px] font-medium leading-none text-foreground/80">
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
  onExplainStep,
  suggestions = [],
  teachingMode,
  projectId,
  onTeachingModeChange,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [highlight, setHighlight] = useState<{ id: string; token: number } | null>(null);
  const [jumpPosition, setJumpPosition] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPinnedRef = useRef(true);
  const observerRef = useRef<ResizeObserver | null>(null);
  const activeJumpRef = useRef<number | null>(null);
  const isJumpScrollingRef = useRef(false);
  const jumpScrollTimerRef = useRef<number | undefined>(undefined);

  const currentChatMessageId = [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null;
  const userMessageIds = useMemo(() => messages.filter((message) => message.role === "user").map((message) => message.id), [messages]);
  const railItems = useMemo(
    () => messages.filter((message) => message.role === "user").map((message) => ({ id: message.id, label: messageLabel(message.content) })),
    [messages]
  );
  const hasRail = !isLoading && railItems.length > 1;

  const userMessageTop = (index: number) => {
    const container = scrollRef.current;
    const id = userMessageIds[index];
    const el = id ? container?.querySelector<HTMLElement>(`[data-user-message="${CSS.escape(id)}"]`) : null;
    if (!container || !el) return null;
    return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  };

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
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 64) isPinnedRef.current = true;
    else if (el.scrollTop < lastScrollTopRef.current) isPinnedRef.current = false;
    lastScrollTopRef.current = el.scrollTop;
    setShowJumpToLatest(!isPinnedRef.current);

    if (!isJumpScrollingRef.current) {
      activeJumpRef.current = null;
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

  const jumpToUserMessage = (direction: -1 | 1) => {
    const count = userMessageIds.length;
    if (count === 0) return;

    const current = activeJumpRef.current ?? (isPinnedRef.current ? count : null);

    let target: number;
    if (current !== null) {
      target = current + direction;
    } else {
      const container = scrollRef.current;
      const nearest = nearestUserMessageIndex();
      if (direction === 1) {
        target = nearest + 1;
      } else if (nearest === -1) {
        target = 0;
      } else {
        const top = userMessageTop(nearest) ?? 0;
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
    <div className="app-surface flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <OrbitSpinner className="h-6 w-6" label="Loading the conversation" />
              <span aria-hidden="true" className="text-shimmer text-xs">Loading the conversation…</span>
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
                    onEdit={!readOnly && !isStreaming ? applySuggestion : undefined}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    isStreaming={isStreaming && !!message.isStreaming}
                    onRetry={!readOnly && !isStreaming && !quotaBlock && message.id === currentChatMessageId ? onRetry : undefined}
                    onAnswer={
                      !readOnly && !isStreaming && !quotaBlock && message.id === messages[messages.length - 1]?.id
                        ? onSendMessage
                        : undefined
                    }
                    onOpenFile={
                      onOpenFile ? (path, target) => onOpenFile(path, message.id === currentChatMessageId, target) : undefined
                    }
                    onExplainStep={onExplainStep}
                    teaching={!!message.teaching}
                    projectId={projectId}
                  />
                )
              )}
              {suggestions.length > 0 && !readOnly && !isStreaming && !quotaBlock && (
                <ul aria-label="Suggested next steps" className="flex w-full max-w-[26rem] flex-col gap-2">
                  {suggestions.map((suggestion, index) => (
                    <li key={suggestion} className="app-rise" style={{ "--i": index } as CSSProperties}>
                      <button type="button" onClick={() => applySuggestion(suggestion)} className="prompt-card">
                        <span aria-hidden="true" className="prompt-card-icon">
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 py-1 leading-snug">{suggestion}</span>
                        <ArrowUpRight aria-hidden="true" className="prompt-card-arrow h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {showJumpToLatest && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Jump to latest message"
            className="app-chip chat-enter absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center text-muted-foreground"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {hasRail && <ChatScrollRail items={railItems} activeIndex={jumpPosition - 1} onSelect={scrollToUserMessage} />}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1">
        {!readOnly && usageMeter}
        {readOnly ? (
          <div className="app-glass flex h-12 items-center justify-center gap-2 rounded-[22px] text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            You have view-only access to this project
          </div>
        ) : quotaBlock ? (
          <div className="chat-enter rounded-2xl border border-destructive/40 bg-destructive/10 px-3.5 py-3">
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
          <form onSubmit={handleSubmit} className="app-glass app-prompt group relative rounded-[20px] p-2.5">
            <div className="flex items-start gap-1">
              <span
                aria-hidden="true"
                className="prompt-badge mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70"
              >
                <Sparkles className="no-icon-anim h-4 w-4" />
              </span>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                rows={2}
                maxLength={16000}
                aria-label="Message Singularity"
                placeholder={
                  isStreaming ? "Draft your next message while Singularity works…" : "Ask Singularity to build or change something…"
                }
                className="app-prompt-input min-h-[56px] w-full flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[14px] leading-6 text-white caret-white outline-none placeholder:text-white/55"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pl-2">
              {isStreaming ? (
                <span className="flex min-w-0 items-center gap-2 text-xs">
                  <OrbitSpinner className="h-3.5 w-3.5" />
                  <span className="text-shimmer truncate">Working on it…</span>
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground">
                  <Kbd>Enter</Kbd> send
                  <span aria-hidden="true" className="text-muted-foreground/50">·</span>
                  <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> new line
                  {userMessageIds.length > 1 && (
                    <span className="hidden items-center gap-1.5 xl:flex">
                      <span aria-hidden="true" className="text-muted-foreground/50">·</span>
                      <Kbd>Alt</Kbd> <Kbd>↑↓</Kbd> jump
                    </span>
                  )}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {onTeachingModeChange && <PromptModeMenu teaching={!!teachingMode} onChange={onTeachingModeChange} />}
                {isStreaming && onStop ? (
                  <button type="button" onClick={onStop} aria-label="Stop generating" title="Stop generating" className="app-stop h-9 w-9">
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                ) : (
                  <button type="submit" disabled={!canSend} aria-label="Send message" className="app-send h-9 w-9">
                    <ArrowUp className="h-4 w-4" />
                  </button>
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
    <div className="flex h-full flex-col items-center justify-center px-6 py-8">
      <div className="flex w-full max-w-[23rem] flex-col items-center text-center">
        <span className="relative mb-6 inline-flex h-14 w-14">
          <span aria-hidden="true" className="empty-glow absolute -inset-[110%]" />
          <HorizonMark drawn className="relative h-full w-full" />
        </span>
        <h3 className="dash-headline app-fade font-display text-[30px] font-semibold leading-tight tracking-tight" style={{ "--i": 2 } as CSSProperties}>
          {readOnly ? (
            "No conversation yet"
          ) : (
            <>
              What should we <em className="heat-text animate-heat-sweep pr-1 font-medium motion-reduce:animate-none">build?</em>
            </>
          )}
        </h3>
        {!readOnly && (
          <ul aria-label="Suggestions" className="mt-8 flex w-full max-w-[20.5rem] flex-col gap-2">
            {EMPTY_STATE_SUGGESTIONS.map(({ text, Icon }, index) => (
              <li key={text} className="app-rise" style={{ "--i": index, "--rise-delay": "380ms" } as CSSProperties}>
                <button type="button" onClick={() => onPick(text)} className="prompt-card">
                  <span aria-hidden="true" className="prompt-card-icon">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{text}</span>
                  <ArrowUpRight aria-hidden="true" className="prompt-card-arrow h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const STARTER_ROW =
  "app-chip group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
      <h3 className="mt-1 max-w-sm truncate font-display text-[22px] font-semibold tracking-tight">{info.projectName}</h3>
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
            <CodeXml className="icon-pop h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
            Browse the code
            <ArrowRight className="ml-auto h-3.5 w-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
          </button>
        )}
        {!readOnly &&
          SHARED_PROJECT_STARTERS.map((starter) => (
            <button key={starter.label} type="button" onClick={() => onPick(starter.prompt)} className={STARTER_ROW}>
              <Sparkles className="icon-pop h-3.5 w-3.5 shrink-0 text-primary" style={{ "--icon-hover": "rotate(18deg) scale(1.2)" } as CSSProperties} />
              {starter.label}
              <ArrowRight className="ml-auto h-3.5 w-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
            </button>
          ))}
      </div>
    </div>
  );
}

const keepLineBreaks = (text: string) => text.replace(/([^\n])\n(?!\n)/g, "$1  \n");

function UserMessage({ message, highlightToken, onEdit }: {
  message: ChatMessage;
  highlightToken: number | null;
  onEdit?: (content: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const brief = splitBrief(message.content);
  const isFolded = !brief && !isOpen && isLongMessage(message.content);
  const toggle = brief || isLongMessage(message.content) ? (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => setIsOpen((open) => !open)}
      className="mt-1 flex h-6 items-center gap-1 rounded-md text-[11.5px] font-medium text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {brief ? (isOpen ? "Hide the full brief" : "Full brief") : isOpen ? "Show less" : "Show more"}
      <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
    </button>
  ) : null;

  return (
    <div data-user-message={message.id} className="chat-enter group/message flex flex-col items-end gap-0">
      <div
        key={highlightToken ?? "idle"}
        className={cn(
          "chat-user-bubble max-w-[85%] break-words rounded-2xl rounded-br-md px-3.5 py-2 transition-[background-color,box-shadow] duration-500",
          highlightToken !== null && "shadow-[0_0_0_2px_hsl(var(--primary)/0.6)]"
        )}
      >
        {brief ? (
          <>
            <ChatMarkdown className="text-[14px] leading-6 text-white">{brief.headline}</ChatMarkdown>
            {isOpen && (
              <ChatMarkdown className="mt-2 border-t border-white/15 pt-2 text-[13px] leading-6 text-white/90">
                {keepLineBreaks(brief.rest)}
              </ChatMarkdown>
            )}
          </>
        ) : (
          <div className={cn(isFolded && "max-h-[9.5rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]")}>
            <ChatMarkdown className="text-[14px] leading-6 text-white">{keepLineBreaks(message.content)}</ChatMarkdown>
          </div>
        )}
        {toggle}
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
  onAnswer,
  onExplainStep,
  teaching,
  projectId,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  onOpenFile?: (path: string, target?: CodeTarget) => void;
  onRetry?: () => void;
  onAnswer?: (answer: string) => void;
  onExplainStep?: (step: StepToExplain) => void;
  teaching?: boolean;
  projectId?: string;
}) {
  const content = message.content || "";
  const revealed = useSmoothStream(content, isStreaming, STREAM_OPTIONS, message.id, message.instantLength);
  const liveEvents = useStreamParser(revealed);
  const isActive = isStreaming || revealed.length < content.length;
  const isIdle = useIsIdle(revealed.length, 700, isActive);

  const hasSavedEvents = !!message.events?.length;
  const events = hasSavedEvents ? message.events! : liveEvents;
  const isDone = !isActive && !message.isStreaming;
  const hasNothingToShow = isDone && !hasSavedEvents && events.length === 0 && !message.error;
  const isEmptyAnswer = hasNothingToShow && message.thoughtSeconds !== undefined;
  const isUnrecorded = hasNothingToShow && !isEmptyAnswer;
  const endedShort = isWorthRetrying(message.outcome);
  const canRetry = isDone && !!onRetry && (endedShort || !!message.error || !!message.wasStopped || isEmptyAnswer);

  return (
    <div className="chat-enter group/message flex min-w-0 flex-col gap-3">
      <AssistantEvents
        events={events}
        isStreaming={!hasSavedEvents && isActive}
        isIdle={isIdle}
        status={message.status}
        startedAt={message.startedAt}
        fallbackThought={message.thoughtSeconds !== undefined ? `Worked for ${formatWorkedFor(message.thoughtSeconds)}` : undefined}
        onOpenFile={onOpenFile}
        onAnswer={isDone ? onAnswer : undefined}
        onExplainStep={isDone ? onExplainStep : undefined}
        teaching={teaching}
        projectId={projectId}
      />
      {message.error && <AssistantError message={message.error} />}
      {isEmptyAnswer && <AssistantError message="The model returned no answer, so nothing was changed" />}
      {isUnrecorded && <AssistantError message="Its chat record wasn't saved, though any files it wrote were" />}
      {canRetry && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {message.wasStopped || message.outcome === "STOPPED"
              ? "You stopped this answer."
              : message.notSent
                ? "Your message wasn't sent. Retry it, or use Edit on it to change it first."
                : message.outcome === "OUT_OF_BUDGET"
                  ? "Today's AI allowance ran out before this finished."
                  : message.outcome === "INCOMPLETE"
                  ? "Part of this plan wasn't written."
                  : message.outcome === "NOT_SAVED"
                    ? "These changes weren't saved."
                    : "This answer didn't finish."}
          </span>
          <button
            type="button"
            onClick={onRetry}
            style={{ "--icon-hover": "rotate(-180deg)" } as CSSProperties}
            className="app-chip group inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-foreground/85"
          >
            <RotateCcw className="icon-pop h-3 w-3" />
            Retry
          </button>
        </div>
      )}
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
