import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ClipboardCopy, Eraser, FileDown, Loader2, MessagesSquare, Sparkles, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/VibeCraftLogo";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { MessageActions } from "@/components/MessageActions";
import { highlightCode } from "@/lib/highlight-code";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { codeLens, useCodeLens, type LensTurn } from "@/lib/code-lens-store";
import { buildLensMarkdown, downloadMarkdown, exportFilename } from "@/lib/chat-export";
import { getFileColor, getFileIcon, splitPath } from "@/lib/file-icons";
import type { CodeSelection } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_INPUT_HEIGHT = 140;

interface CodeLensPanelProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  /** Opens the file a snippet came from, scrolled to its first line. */
  onOpenSelection: (path: string, line: number, code?: string, endLine?: number) => void;
}

const rangeLabel = (selection: CodeSelection) =>
  selection.startLine === selection.endLine
    ? `line ${selection.startLine}`
    : `lines ${selection.startLine}-${selection.endLine}`;

/**
 * The snippet a turn is about, quoted inline in the transcript.
 *
 * <p>Code is shown in a horizontally scrolling block rather than wrapped: wrapped code re-indents itself and
 * stops looking like code, which in a narrow panel is exactly when it's hardest to read.
 */
function SnippetQuote({ selection, onOpen }: { selection: CodeSelection; onOpen: () => void }) {
  const Icon = getFileIcon(selection.path);
  const { base } = splitPath(selection.path);
  const lineCount = selection.code.split("\n").length;

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-border/70 bg-background/50">
      <button
        type="button"
        onClick={onOpen}
        title={`Go to ${selection.path}:${selection.startLine}`}
        className="group flex w-full items-center gap-1.5 border-b border-border/60 px-2 py-1 text-left text-[11px] transition-colors hover:bg-primary/10"
      >
        <Icon className={cn("h-3 w-3 shrink-0", getFileColor(selection.path))} />
        <span className="truncate font-medium text-foreground/85 group-hover:text-primary">{base}</span>
        <span className="shrink-0 text-muted-foreground">{rangeLabel(selection)}</span>
      </button>
      <pre className="max-h-52 overflow-y-auto px-2 py-1.5 text-[11px] leading-[1.6]">
        {/* Wraps rather than scrolling sideways: reading a reply shouldn't mean scrolling two directions. */}
        <code className="block whitespace-pre-wrap break-words font-mono text-foreground/80">
          {highlightCode(selection.code, selection.path).map((token, index) =>
            token.cls ? <span key={index} className={token.cls}>{token.text}</span> : token.text
          )}
        </code>
      </pre>
      {lineCount > 12 && (
        <p className="border-t border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">
          {lineCount} lines
        </p>
      )}
    </div>
  );
}

function Turn({ turn, onOpenSelection, onDelete }: {
  turn: LensTurn;
  onOpenSelection: (path: string, line: number, code?: string, endLine?: number) => void;
  /** Wipes this exchange - the question and its answer together, since half of one is no use. */
  onDelete: () => void;
}) {
  const quote = turn.selection && (
    <SnippetQuote
      selection={turn.selection}
      onOpen={() => onOpenSelection(turn.selection!.path, turn.selection!.startLine, turn.selection!.code, turn.selection!.endLine)}
    />
  );

  if (turn.role === "user") {
    return (
      <div className="group/message">
        {quote}
        <div className="flex justify-end">
          <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary/15 px-3 py-1.5 text-[13px] text-foreground">
            {turn.content}
          </p>
        </div>
        <MessageActions
          at={turn.at}
          onCopy={() => turn.content}
          onDelete={onDelete}
          deleteLabel="Delete this note"
          align="right"
        />
      </div>
    );
  }

  return (
    <div className="group/message">
      {quote}
      <div className="flex gap-2">
        <LogoMark className="mt-0.5 h-4 w-4 shrink-0" title="VibeCraft" />
        <div className="min-w-0 flex-1">
          {/* Until the first token lands there's nothing to render, so say what's happening instead. */}
          {turn.isStreaming && !turn.content ? (
            <span className="text-shimmer text-xs font-medium">Reading the code&hellip;</span>
          ) : (
            <ChatMarkdown className="text-[13px]">{turn.content}</ChatMarkdown>
          )}
        </div>
      </div>
      {/* Not while it's still arriving: copying or deleting half an answer isn't what either button means. */}
      {!turn.isStreaming && (
        <MessageActions
          at={turn.at}
          onCopy={() => turn.content}
          onDelete={onDelete}
          deleteLabel="Delete this note"
          className="pl-6"
        />
      )}
    </div>
  );
}

/**
 * The code lens: a running conversation about this project's code.
 *
 * <p>Docked beside the editor rather than floating over it - the point is reading an explanation *while*
 * looking at the code, and a popover anchored to the selection covers exactly what's being discussed.
 */
export function CodeLensPanel({ projectId, projectName, onClose, onOpenSelection }: CodeLensPanelProps) {
  const thread = useCodeLens(projectId);
  const [question, setQuestion] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const [copiedAll, copyAll] = useCopyFeedback();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const turns = thread?.turns ?? [];
  const isBusy = thread?.isBusy ?? false;
  const isLoading = thread?.isLoading ?? false;
  const selection = thread?.selection ?? null;

  // How far from the bottom still counts as "following along" - about a line and a half of prose.
  const stickToBottom = useRef(true);
  const lastTurn = turns[turns.length - 1];
  // Grows with every chunk of a streaming answer, which is what makes the effect below run as it arrives.
  const streamedLength = lastTurn?.isStreaming ? lastTurn.content.length : 0;

  // A new turn always scrolls into view - asking a question should show it.
  useEffect(() => {
    stickToBottom.current = true;
  }, [turns.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    // Jump rather than glide while the answer is streaming: a smooth scroll per chunk fights the next one.
    // Optional-called because jsdom has no `scrollTo`, the same way the chat rail handles `scrollIntoView`.
    el.scrollTo?.({ top: el.scrollHeight, behavior: streamedLength > 0 ? "auto" : "smooth" });
  }, [turns.length, streamedLength, isBusy]);

  // Scrolling up to re-read something must not be undone by the next chunk, so following stops until the
  // reader comes back to the bottom.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (thread?.isOpen && !thread.isBusy) inputRef.current?.focus();
  }, [thread?.isOpen, thread?.selection?.code, thread?.isBusy]);

  if (!thread?.isOpen) return null;

  const send = () => {
    const text = question.trim();
    if (!text || isBusy) return;
    setQuestion("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void codeLens.ask(projectId, text);
  };

  const handleExport = () =>
    downloadMarkdown(exportFilename(projectName, "notes"), buildLensMarkdown(turns, projectName));

  /**
   * The same markdown the export writes to a file, put on the clipboard instead - for pasting the thread
   * straight into notes or an issue, without a download to find and open first.
   */
  const handleCopyAll = () => copyAll(buildLensMarkdown(turns, projectName));

  return (
    <aside className="flex h-full min-w-0 flex-col bg-panel animate-in fade-in-0 slide-in-from-right-2 duration-200">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-2.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex-1 truncate text-xs font-medium text-foreground/90">ExplainLLM</span>
        {turns.length > 0 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Clear these notes"
                  onClick={() => setIsClearing(true)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                >
                  <Eraser className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear notes</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={copiedAll ? "Copied" : "Copy as markdown"}
                  onClick={() => void handleCopyAll()}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted/60 hover:text-primary",
                    copiedAll ? "text-syntax-string" : "text-muted-foreground"
                  )}
                >
                  {copiedAll ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{copiedAll ? "Copied" : "Copy as markdown"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Export as markdown"
                  onClick={handleExport}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export as markdown</TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Close ExplainLLM"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3.5",
          // Nothing to scroll yet, so the prompt centres itself instead of hanging off the top edge.
          turns.length === 0 && !isBusy && !isLoading && "flex flex-col justify-center"
        )}
      >
        {/* Saved notes are still on their way - an empty panel here would read as "you've never asked anything". */}
        {turns.length === 0 && isLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading your notes&hellip;</span>
          </div>
        )}

        {turns.length === 0 && !isBusy && !isLoading && (
          <div className="flex flex-col items-center gap-2 text-center">
            <MessagesSquare className="h-6 w-6 text-muted-foreground/40" />
            <p className="max-w-[16rem] text-xs text-muted-foreground">
              {selection
                ? "Ask anything about the code you selected - or about the project in general."
                : "Ask anything about this project's code. Select code in the editor to ask about a specific part."}
            </p>
            {selection && (
              <button
                type="button"
                onClick={() => void codeLens.explain(projectId)}
                className="rounded-md px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
              >
                Explain it to me
              </button>
            )}
          </div>
        )}

        {turns.map((turn) => (
          <Turn
            key={turn.id}
            turn={turn}
            onOpenSelection={onOpenSelection}
            onDelete={() => codeLens.deleteExchange(projectId, turn.exchangeId)}
          />
        ))}

        {isBusy && !turns.at(-1)?.isStreaming && (
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-shimmer font-medium">Reading the code&hellip;</span>
          </div>
        )}

        {thread.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <span className="min-w-0 flex-1">{thread.error}</span>
            <button
              type="button"
              onClick={() => codeLens.dismissError(projectId)}
              className="shrink-0 rounded px-1 hover:bg-destructive/15"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 p-2">
        {/* What the next question is about, so it's clear the subject follows the editor selection. */}
        {/* Dismissable, since a selection is optional: clearing it makes the next question about the whole project. */}
        {selection && (
          <div className="mb-1.5 flex items-center gap-0.5 rounded-md bg-muted/40 text-[10px] text-muted-foreground">
            <button
              type="button"
              onClick={() => onOpenSelection(selection.path, selection.startLine, selection.code, selection.endLine)}
              className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-primary/10"
            >
              <span className="shrink-0 uppercase tracking-wider text-muted-foreground/70">Asking about</span>
              <span className="truncate font-medium text-foreground/80 group-hover:text-primary">
                {splitPath(selection.path).base}
              </span>
              <span className="shrink-0">{rangeLabel(selection)}</span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Stop asking about the selected code"
                  onClick={() => codeLens.clearSelection(projectId)}
                  className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Ask about the whole project instead</TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-xl border border-border/80 bg-background/60 p-1.5 transition-colors focus-within:border-primary/50">
          <textarea
            ref={inputRef}
            value={question}
            rows={1}
            placeholder={selection ? "Ask about this code…" : "Ask about this project's code…"}
            aria-label="Ask about the code"
            onChange={(e) => {
              setQuestion(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, MAX_INPUT_HEIGHT)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-[140px] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] text-foreground caret-primary outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={send}
            disabled={!question.trim() || isBusy}
            aria-label="Send question"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Stated plainly, because both halves matter: they're kept, and nobody else on the project sees them. */}
        <p className="px-1 pt-1.5 text-[10px] text-muted-foreground/70">
          Private to you and saved until you delete them.
        </p>
      </div>

      {/* Clearing deletes the saved thread outright, so it asks first - a single note's bin icon doesn't. */}
      <AlertDialog open={isClearing} onOpenChange={setIsClearing}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear ExplainLLM notes for this project?</AlertDialogTitle>
            <AlertDialogDescription>
              All {turns.length} messages in this thread will be deleted. This can&rsquo;t be undone — export
              them first if you want to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => codeLens.clear(projectId)}
              className={buttonVariants({ variant: "destructive" })}
            >
              Clear notes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
