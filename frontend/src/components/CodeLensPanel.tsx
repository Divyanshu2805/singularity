/**
 * The code lens: a running conversation about this project's code.
 *
 * Handles: asking about a selected block or the project as a whole, streaming the answer, keeping the thread, opening
 * the block a saved question was about, deleting one exchange or clearing the thread, and exporting it.
 *
 * Docked beside the editor rather than floating over it - the point is reading an explanation while looking at the
 * code, and a popover anchored to the selection would cover exactly what is being discussed.
 *
 * It is dressed as the build chat is (index.css): the app's charcoal surface, the horizon mark signing each answer,
 * turns rising in as they arrive, the question in a gold bubble, the app's comet while it reads the code, and a
 * matte composer that takes a calm gold ring while focused. Its header is the window's lighter top band (.ws-bar)
 * with the app's icon buttons, a quoted snippet is a card with its file named in a lighter head, and the line that
 * explained where notes are kept was removed from under the composer, as the owner asked of explanatory footnotes.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ClipboardCopy, Eraser, FileDown, MessagesSquare, X } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
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
import { HorizonMark } from "@/components/HorizonMark";
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
  onOpenSelection: (path: string, line: number, code?: string, endLine?: number) => void;
}

const rangeLabel = (selection: CodeSelection) =>
  selection.startLine === selection.endLine
    ? `line ${selection.startLine}`
    : `lines ${selection.startLine}-${selection.endLine}`;

function SnippetQuote({ selection, onOpen }: { selection: CodeSelection; onOpen: () => void }) {
  const Icon = getFileIcon(selection.path);
  const { base } = splitPath(selection.path);
  const lineCount = selection.code.split("\n").length;

  return (
    <div className="ws-card mb-2 overflow-hidden rounded-lg">
      <button
        type="button"
        onClick={onOpen}
        title={`Go to ${selection.path}:${selection.startLine}`}
        className="hl-row group flex w-full items-center gap-1.5 border-b border-white/[0.08] bg-[hsl(var(--ws-card-head))] px-2 py-1 text-left text-[11px] focus-visible:outline-none"
      >
        <Icon className={cn("h-3 w-3 shrink-0", getFileColor(selection.path))} />
        <span className="truncate font-medium text-foreground/85 group-hover:text-primary">{base}</span>
        <span className="shrink-0 text-muted-foreground">{rangeLabel(selection)}</span>
      </button>
      <pre className="max-h-52 overflow-y-auto px-2 py-1.5 text-[11px] leading-[1.6]">
        <code className="block whitespace-pre-wrap break-words font-mono text-foreground/80">
          {highlightCode(selection.code, selection.path).map((token, index) =>
            token.cls ? <span key={index} className={token.cls}>{token.text}</span> : token.text
          )}
        </code>
      </pre>
      {lineCount > 12 && (
        <p className="border-t border-white/[0.08] px-2 py-0.5 text-[10px] text-muted-foreground">
          {lineCount} lines
        </p>
      )}
    </div>
  );
}

function Turn({ turn, onOpenSelection, onDelete }: {
  turn: LensTurn;
  onOpenSelection: (path: string, line: number, code?: string, endLine?: number) => void;
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
      <div className="chat-enter group/message">
        {quote}
        <div className="flex justify-end">
          <p className="chat-user-bubble max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-3 py-1.5 text-[13px] text-foreground">
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
    <div className="chat-enter group/message">
      {quote}
      <div className="flex gap-2">
        <HorizonMark className="mt-0.5 h-4 w-4 shrink-0" title="Singularity" />
        <div className="min-w-0 flex-1">
          {turn.isStreaming && !turn.content ? (
            <span className="text-shimmer text-xs font-medium">Reading the code&hellip;</span>
          ) : (
            <ChatMarkdown className="text-[13px]">{turn.content}</ChatMarkdown>
          )}
        </div>
      </div>
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

  const stickToBottom = useRef(true);
  const lastTurn = turns[turns.length - 1];
  const streamedLength = lastTurn?.isStreaming ? lastTurn.content.length : 0;

  useEffect(() => {
    stickToBottom.current = true;
  }, [turns.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTo?.({ top: el.scrollHeight, behavior: streamedLength > 0 ? "auto" : "smooth" });
  }, [turns.length, streamedLength, isBusy]);

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

  const handleCopyAll = () => copyAll(buildLensMarkdown(turns, projectName));

  return (
    <aside className="app-surface flex h-full min-w-0 flex-col animate-in fade-in-0 slide-in-from-right-2 duration-300">
      <header className="ws-bar flex h-11 shrink-0 items-center gap-1 pl-3.5 pr-1.5">
        <HorizonMark drawn className="mr-1 h-4 w-4" />
        <span className="flex-1 truncate font-display text-[14px] font-semibold tracking-tight text-foreground">Explain<em className="heat-text animate-heat-sweep pr-0.5 font-medium motion-reduce:animate-none">LLM</em></span>
        {turns.length > 0 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Clear these notes"
                  onClick={() => setIsClearing(true)}
                  className="icon-btn h-7 w-7 rounded-lg"
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
                  className={cn("icon-btn h-7 w-7 rounded-lg", copiedAll && "text-syntax-string")}
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
                  className="icon-btn h-7 w-7 rounded-lg"
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
              className="icon-btn h-7 w-7 rounded-lg"
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
          turns.length === 0 && !isBusy && !isLoading && "flex flex-col justify-center"
        )}
      >
        {turns.length === 0 && isLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <OrbitSpinner className="h-3.5 w-3.5" />
            <span className="text-shimmer">Loading your notes&hellip;</span>
          </div>
        )}

        {turns.length === 0 && !isBusy && !isLoading && (
          <div className="chat-enter flex flex-col items-center gap-2 text-center">
            <span className="prompt-card-icon mb-1 h-10 w-10 rounded-xl"><MessagesSquare className="h-5 w-5" /></span>
            <p className="max-w-[16rem] text-xs text-muted-foreground">
              {selection
                ? "Ask anything about the code you selected - or about the project in general."
                : "Ask anything about this project's code. Select code in the editor to ask about a specific part."}
            </p>
            {selection && (
              <button
                type="button"
                onClick={() => void codeLens.explain(projectId)}
                className="app-chip mt-1 px-3 py-1.5 text-xs text-foreground"
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
          <div className="chat-enter flex items-center gap-2 text-xs">
            <OrbitSpinner className="h-3.5 w-3.5" />
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

      <div className="shrink-0 border-t border-white/[0.08] p-2.5">
        {selection && (
          <div className="ws-card mb-1.5 flex items-center gap-0.5 rounded-lg text-[10.5px] text-muted-foreground">
            <button
              type="button"
              onClick={() => onOpenSelection(selection.path, selection.startLine, selection.code, selection.endLine)}
              className="hl-row group flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-left focus-visible:outline-none"
            >
              <span className="shrink-0 uppercase tracking-wider text-muted-foreground">Asking about</span>
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
                  className="icon-btn mr-0.5 h-5 w-5 rounded-md"
                >
                  <X className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Ask about the whole project instead</TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="app-field relative flex items-end gap-1.5 rounded-2xl p-1.5">
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
            className="max-h-[140px] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] text-foreground caret-primary outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={send}
            disabled={!question.trim() || isBusy}
            aria-label="Send question"
            className="app-send h-7 w-7"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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
