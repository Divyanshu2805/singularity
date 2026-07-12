import { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, Download, GitCompare, MessagesSquare, PanelLeft, PanelLeftClose } from "lucide-react";
import { FileTree, type TreeExpansionCommand } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { FileTabs } from "./FileTabs";
import { CodeLensPanel } from "./CodeLensPanel";
import { CodeSearchPanel } from "./CodeSearchPanel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { api, buildFileTree, OPEN_TABS_KEY, ACTIVE_TAB_KEY } from "@/lib/api";
import { splitPath } from "@/lib/file-icons";
import { cn } from "@/lib/utils";
import { codeLens, useCodeLens } from "@/lib/code-lens-store";
import type { CodeTarget } from "@/lib/lesson";
import { firstChangedLine } from "@/lib/diff-lines";
import type { CodeSelection } from "@/lib/types";

// A user preference about the editor layout, not tied to any one project.
const FILE_TREE_VISIBLE_KEY = "code_panel_files_visible";
// How long the copy button shows its "Copied" checkmark before reverting.
const COPY_FEEDBACK_MS = 1500;

export interface OpenFileRequest {
  path: string;
  id: number;
  /** False for files referenced by older chats - those always open as full content. */
  showDiff: boolean;
  /** A line to scroll to and highlight, from a teaching-mode walkthrough's code reference. */
  target?: CodeTarget;
}

interface CodePanelProps {
  projectId: string;
  /** Only used to name exported files - the panel never displays it. */
  projectName: string;
  /** Final content of files the AI finished writing - shown in the tree the moment each one completes. */
  completedFiles: ReadonlyMap<string, string>;
  /** Files the AI deleted - hidden from the tree and closed straight away, before the server has caught up. */
  deletedFiles?: ReadonlySet<string>;
  /** Content of files still being written, as far as it has arrived. Shown instead of fetching a file the server doesn't have yet. */
  streamingFiles: ReadonlyMap<string, string>;
  /** Pre-edit content for files the most recent chat turn changed - available until an even newer turn replaces it. */
  diffBaselines: ReadonlyMap<string, string>;
  isStreaming: boolean;
  streamingFilePath: string | null;
  lastTurnFiles: readonly string[];
  /** Set with a fresh id to open a file from elsewhere, e.g. a file mentioned in chat. */
  openFileRequest: OpenFileRequest | null;
  onDiffViewed: (path: string) => void;
}

const DEFAULT_FILES = ["src/pages/Index.tsx", "pages/Index.tsx"];
const EMPTY_CONTENTS: ReadonlyMap<string, string> = new Map();

const getTabsKey = (projectId: string) => `${OPEN_TABS_KEY}_${projectId}`;
const getActiveTabKey = (projectId: string) => `${ACTIVE_TAB_KEY}_${projectId}`;

function readSavedTabs(projectId: string): { tabs: string[]; active: string | null } {
  try {
    const tabs = JSON.parse(localStorage.getItem(getTabsKey(projectId)) ?? "[]");
    if (Array.isArray(tabs) && tabs.length > 0) {
      const active = localStorage.getItem(getActiveTabKey(projectId));
      return { tabs, active: active && tabs.includes(active) ? active : tabs[0] };
    }
  } catch {
    // Unreadable saved tabs just start fresh
  }
  return { tabs: [], active: null };
}

const addTab = (tabs: string[], path: string) => (tabs.includes(path) ? tabs : [...tabs, path]);

export const CodePanel = memo(function CodePanel({
  projectId,
  projectName,
  completedFiles,
  deletedFiles,
  streamingFiles,
  diffBaselines,
  isStreaming,
  streamingFilePath,
  lastTurnFiles,
  openFileRequest,
  onDiffViewed,
}: CodePanelProps) {
  const { toast } = useToast();
  const [savedTabs] = useState(() => readSavedTabs(projectId));
  const [openTabs, setOpenTabs] = useState<string[]>(savedTabs.tabs);
  const [activeTab, setActiveTab] = useState<string | null>(savedTabs.active);
  const [serverPaths, setServerPaths] = useState<string[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  // Last content fetched per file, so returning to a tab shows it instantly while it refreshes quietly.
  const [fetchedContents, setFetchedContents] = useState<ReadonlyMap<string, string>>(EMPTY_CONTENTS);
  const [treeExpansion, setTreeExpansion] = useState<TreeExpansionCommand | null>(null);
  const [showFileTree, setShowFileTree] = useState(() => localStorage.getItem(FILE_TREE_VISIBLE_KEY) !== "false");
  // Find-in-files lives in the files column, so results stay next to the code they point at. An empty
  // query means the tree is showing; typing swaps in results without the column changing mode.
  const [searchQuery, setSearchQuery] = useState("");
  const lensThread = useCodeLens(projectId);
  const isLensOpen = !!lensThread?.isOpen;

  // The notes themselves come back from the server; this only reopens the panel on the block it was left
  // pointed at, so a refresh doesn't quietly close what someone was reading.
  useEffect(() => {
    codeLens.restore(projectId);
  }, [projectId]);

  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  // Deliberately no CSS transition on the panels' `flex`: react-resizable-panels writes the flex shorthand
  // inline and measures the *computed* value back on the next layout pass, so animating it feeds a
  // mid-animation number into its own maths and the layout settles wrong (a "collapsed" column stuck at
  // 397px while the editor next to it got 22px). Smoothness comes from animating the panel contents, which
  // the library never measures.
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const copyResetRef = useRef<number>();
  // Which files the diff toggle is currently switched on for. Per-file, and never cleared just from
  // navigating away - the whole point is that the button keeps working the next time you want it, not
  // just once. It resets to "off" on its own once a newer turn changes the file again, since that turn
  // starts with a fresh (empty) `diffBaselines` and the toggle only has any effect where a baseline exists.
  const [openDiffPaths, setOpenDiffPaths] = useState<ReadonlySet<string>>(new Set());
  // Changed files the reader has opened since the latest turn. Their dot goes away on that first open -
  // separately from `diffBaselines`, which stays so the diff toggle keeps working after the dot is gone.
  const [viewedPaths, setViewedPaths] = useState<ReadonlySet<string>>(new Set());

  const onDiffViewedRef = useRef(onDiffViewed);
  onDiffViewedRef.current = onDiffViewed;
  const lastTurnFilesRef = useRef(lastTurnFiles);
  lastTurnFilesRef.current = lastTurnFiles;

  useEffect(() => {
    if (openTabs.length > 0) localStorage.setItem(getTabsKey(projectId), JSON.stringify(openTabs));
    else localStorage.removeItem(getTabsKey(projectId));
  }, [openTabs, projectId]);

  useEffect(() => {
    if (activeTab) localStorage.setItem(getActiveTabKey(projectId), activeTab);
    else localStorage.removeItem(getActiveTabKey(projectId));
  }, [activeTab, projectId]);

  useEffect(() => {
    localStorage.setItem(FILE_TREE_VISIBLE_KEY, String(showFileTree));
  }, [showFileTree]);

  useEffect(() => () => window.clearTimeout(copyResetRef.current), []);

  const loadTree = useCallback(async () => {
    try {
      const paths = await api.getFilePaths(projectId);
      setServerPaths(paths);
      return paths;
    } catch (error) {
      console.error("Failed to load files:", error);
      return null;
    } finally {
      setIsLoadingTree(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadTree().then((paths) => {
      if (!paths || savedTabs.tabs.length > 0) return;
      const defaultPath = DEFAULT_FILES.find((path) => paths.includes(path));
      if (defaultPath) {
        setOpenTabs((prev) => (prev.length === 0 ? [defaultPath] : prev));
        setActiveTab((prev) => prev ?? defaultPath);
      }
    });
  }, [loadTree, savedTabs]);

  // Files the AI finished are merged in straight away; the server's list catches up once the response is saved.
  const files = useMemo(() => {
    const paths = new Set(serverPaths);
    deletedFiles?.forEach((path) => paths.delete(path));
    completedFiles.forEach((_, path) => paths.add(path));
    return buildFileTree([...paths]);
  }, [serverPaths, completedFiles, deletedFiles]);

  // A deleted file's tab has nothing behind it any more.
  useEffect(() => {
    if (!deletedFiles || deletedFiles.size === 0) return;
    setOpenTabs((prev) => (prev.some((path) => deletedFiles.has(path)) ? prev.filter((path) => !deletedFiles.has(path)) : prev));
    setActiveTab((active) => (active && deletedFiles.has(active) ? null : active));
  }, [deletedFiles]);

  // When a response finishes: add tabs for whatever it changed (so they're one click away) and sync the
  // tree with the server. Deliberately doesn't touch `activeTab` - which file is open is the user's call,
  // not something a finished generation gets to decide by jumping to whichever file it wrote last.
  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    // A new turn can change a file again, so what was already looked at earns its dot back.
    if (!wasStreamingRef.current && isStreaming) setViewedPaths(new Set());
    if (wasStreamingRef.current && !isStreaming) {
      const changed = lastTurnFilesRef.current;
      if (changed.length > 0) setOpenTabs((prev) => changed.reduce(addTab, prev));
      loadTree();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, loadTree]);

  // The line a walkthrough pointed at, kept with its file and request id so revealing the same line twice still scrolls.
  const [reveal, setReveal] = useState<(CodeTarget & { path: string; id: number }) | null>(null);

  // A request that already existed when this panel mounted was handled by an earlier mount - replaying it
  // would jump the editor to some file the reader opened long ago.
  const handledRequestIdRef = useRef(openFileRequest?.id ?? null);
  useEffect(() => {
    if (!openFileRequest || openFileRequest.id === handledRequestIdRef.current) return;
    handledRequestIdRef.current = openFileRequest.id;
    const { path, showDiff, target, id } = openFileRequest;
    if (!showDiff) onDiffViewedRef.current(path);
    setOpenTabs((prev) => addTab(prev, path));
    setActiveTab(path);
    setReveal(target ? { ...target, path, id } : null);
  }, [openFileRequest]);

  // Content the AI finished wins over the server's copy: it's newer, and until the response finishes the
  // server doesn't have it at all (files are only persisted once the whole response completes). Asking for
  // one mid-response used to 404 for the ~30s a generation takes.
  const completedContent = activeTab ? completedFiles.get(activeTab) : undefined;
  // A file the AI is rewriting right now is never typed out in the editor: the open file keeps showing its
  // last known version and swaps to the new one in a single step when it's done. `streamingFiles` is still
  // what says it's mid-write - and why it isn't fetched, since a brand-new file doesn't exist server-side yet.
  const isBeingWritten = !!activeTab && streamingFiles.has(activeTab);
  const skipFetch = completedContent !== undefined || isBeingWritten;

  useEffect(() => {
    if (!activeTab || skipFetch) return;
    const path = activeTab;
    let isCancelled = false;
    api.getFileContent(projectId, path)
      .then((content) => {
        if (isCancelled) return;
        setFetchedContents((prev) => (prev.get(path) === content ? prev : new Map(prev).set(path, content)));
      })
      .catch((error) => {
        console.error("Failed to load file:", error);
        if (isCancelled) return;
        setFetchedContents((prev) => (prev.has(path) ? prev : new Map(prev).set(path, "// Couldn't load this file")));
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId, activeTab, skipFetch]);

  const fetchedContent = activeTab ? fetchedContents.get(activeTab) : undefined;
  const knownContent = completedContent ?? fetchedContent;
  const content = knownContent ?? "";
  // Mid-write with nothing to show yet (a new file, or one never opened before) - a still note, not a spinner.
  const isAwaitingNewFile = isBeingWritten && knownContent === undefined;
  const isLoadingFile = !!activeTab && !isBeingWritten && knownContent === undefined;

  // Whether the last chat turn left a diff available for this file at all - independent of whether the
  // toggle below is currently switched on. A file the last turn never touched has nothing to show.
  const hasDiffAvailable = activeTab ? diffBaselines.has(activeTab) : false;
  const isDiffToggledOn = activeTab ? openDiffPaths.has(activeTab) : false;
  // Shown against its pre-edit baseline while toggled on - including while the file is still being
  // rewritten, so it reflects what's arriving live, not just the finished result. Off by default: the
  // reader chooses to see it rather than having it forced on them the moment a file finishes.
  const diffOriginal = hasDiffAvailable && isDiffToggledOn && activeTab ? diffBaselines.get(activeTab) ?? null : null;
  const isShowingDiff = diffOriginal !== null;

  /**
   * Switching the diff on also takes the reader to it: the first line the file stops matching its pre-edit
   * baseline, scrolled to centre and briefly highlighted, the same reveal a walkthrough's quoted line uses.
   * Painting the diff and leaving them to hunt for it is fine in a short file and useless in a long one.
   *
   * <p>`setReveal` directly rather than `revealInFile`, since the file being diffed is already the active
   * tab - there is nothing to open or switch to. Switching the diff *off* reveals nothing: the reader is
   * looking at the finished file, not at a change.
   */
  const toggleDiff = useCallback(() => {
    if (!activeTab) return;
    const turningOn = !openDiffPaths.has(activeTab);
    setOpenDiffPaths((prev) => {
      const next = new Set(prev);
      if (next.has(activeTab)) next.delete(activeTab);
      else next.add(activeTab);
      return next;
    });
    if (!turningOn) return;

    const baseline = diffBaselines.get(activeTab);
    const line = baseline === undefined ? null : firstChangedLine(baseline, content);
    // `Date.now()` so switching it off and back on scrolls there again rather than being deduped as the
    // same reveal. No `code`: the line number is measured against the content on screen right now, so
    // there's nothing for `findCodeLine` to re-locate.
    if (line) setReveal({ path: activeTab, line, id: Date.now() });
  }, [activeTab, openDiffPaths, diffBaselines, content]);

  // Opening a changed file counts as seeing it - including already sitting on it when its change lands.
  useEffect(() => {
    if (!activeTab || !diffBaselines.has(activeTab)) return;
    setViewedPaths((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
  }, [activeTab, diffBaselines]);

  const changedPaths = useMemo(
    () => new Set([...diffBaselines.keys()].filter((path) => !viewedPaths.has(path))),
    [diffBaselines, viewedPaths]
  );

  const handleSelectFile = useCallback((path: string) => {
    setOpenTabs((prev) => addTab(prev, path));
    setActiveTab(path);
  }, []);

  const handleCloseTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((tab) => tab !== path);
      setActiveTab((current) => {
        if (current !== path) return current;
        const closingIndex = prev.indexOf(path);
        return next[Math.min(closingIndex, next.length - 1)] ?? null;
      });
      return next;
    });
  }, []);

  // A local reveal, mirroring what `openFileRequest` does for the chat - `Date.now()` so the same hit twice re-scrolls.
  const revealInFile = useCallback((path: string, line: number, code?: string, endLine?: number) => {
    setOpenTabs((prev) => addTab(prev, path));
    setActiveTab(path);
    setReveal({ path, line, code, endLine, id: Date.now() });
  }, []);

  const handleOpenMatch = useCallback((path: string, line: number, text: string) => {
    // The matched line is passed as `code` so `findCodeLine` can re-locate it if the file has shifted since.
    revealInFile(path, line, text);
  }, [revealInFile]);

  const handleSelectionAction = useCallback((selection: CodeSelection, action: "explain" | "ask") => {
    codeLens.open(projectId, selection, { explain: action === "explain" });
  }, [projectId]);

  // Opening the notes panel deliberately leaves the file column alone - the app sidebar gives up its space
  // instead (see ProjectView). The file list is part of working on the code, so it stays where it was.

  const handleCopyFile = async () => {
    if (!activeTab) return;
    try {
      await navigator.clipboard.writeText(content);
      window.clearTimeout(copyResetRef.current);
      setCopyState("copied");
      copyResetRef.current = window.setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    } catch {
      toast({ title: "Couldn't copy the file", variant: "destructive" });
    }
  };

  // Downloads just this one file, named by its own filename - not the whole-project ZIP the header offers.
  const handleDownloadFile = () => {
    if (!activeTab) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = splitPath(activeTab).base;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="flex h-full bg-background">
      {/*
        Fixed width on purpose: this column is not part of the resizable group, so dragging the chat/code
        divider changes the space the editor gets and never the width of the file list. Because nothing
        measures it, its width can be animated - which is what makes opening and closing it smooth.
      */}
      <div
        className={cn(
          "shrink-0 overflow-hidden border-r border-border/60 bg-panel transition-[width] duration-200 ease-out",
          showFileTree ? "w-60 border-r" : "w-0 border-r-0"
        )}
      >
        <div className="flex h-full w-60 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/60 pl-3 pr-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Files</span>
            <div className="flex items-center">
              {([
                { mode: "expand", label: "Expand all folders", Icon: ChevronsUpDown },
                { mode: "collapse", label: "Collapse all folders", Icon: ChevronsDownUp },
              ] as const).map(({ mode, label, Icon }) => (
                <Tooltip key={mode}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={label}
                      disabled={files.length === 0}
                      onClick={() => setTreeExpansion({ mode, id: Date.now() })}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Hide files panel"
                    onClick={() => setShowFileTree(false)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Hide files panel</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <CodeSearchPanel
            projectId={projectId}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onOpenMatch={handleOpenMatch}
            activePath={activeTab}
          />

          {/* The tree is what the column shows whenever nothing is being searched for. */}
          {searchQuery.trim().length === 0 && (
            <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
              <FileTree
                files={files}
                selectedPath={activeTab}
                onSelectFile={handleSelectFile}
                isLoading={isLoadingTree && files.length === 0}
                changedPaths={changedPaths}
                expansion={treeExpansion}
              />
            </div>
          )}
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="min-w-0 flex-1">
        <ResizablePanel order={1} minSize={30} className="min-w-0 overflow-hidden">
          <div className="flex h-full min-w-0 flex-col">
            <FileTabs
              openTabs={openTabs}
              activeTab={activeTab}
              changedPaths={changedPaths}
              onSelectTab={setActiveTab}
              onCloseTab={handleCloseTab}
              leading={
                !showFileTree ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Show files panel"
                        onClick={() => setShowFileTree(true)}
                        className="flex w-9 shrink-0 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-primary"
                      >
                        <PanelLeft className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Show files panel</TooltipContent>
                  </Tooltip>
                ) : undefined
              }
              actions={
                activeTab ? (
                  <div className="flex shrink-0 items-center gap-1 border-l border-border/50 pl-1.5 pr-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={isLensOpen ? "Close ExplainLLM" : "Open ExplainLLM"}
                          onClick={() => (isLensOpen ? codeLens.close(projectId) : codeLens.reopen(projectId))}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/60 hover:text-primary",
                            isLensOpen ? "bg-primary/15 text-primary" : "text-muted-foreground"
                          )}
                        >
                          <MessagesSquare className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isLensOpen ? "Close ExplainLLM" : "Open ExplainLLM"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Copy file contents"
                          onClick={handleCopyFile}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                        >
                          {copyState === "copied" ? <Check className="h-3.5 w-3.5 text-syntax-string" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{copyState === "copied" ? "Copied" : "Copy file"}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Download this file"
                          onClick={handleDownloadFile}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Download file</TooltipContent>
                    </Tooltip>
                  </div>
                ) : undefined
              }
            />

            <div className="relative min-h-0 flex-1 overflow-hidden">
              {/*
                Lives over the code itself, not the tab bar, and stays put whether or not it's switched on:
                the last turn's diff for this file is always one click away, rather than a one-shot control
                that vanishes once shown. Off by default - a finished edit reads as plain code until asked.
              */}
              {hasDiffAvailable && (
                <div className="absolute right-3 top-3 z-10">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-pressed={isDiffToggledOn}
                        aria-label={isDiffToggledOn ? "Hide changes from the last chat" : "Show changes from the last chat"}
                        onClick={toggleDiff}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md border shadow-sm backdrop-blur-sm transition-colors",
                          isDiffToggledOn
                            ? "border-primary/50 bg-primary/20 text-primary hover:bg-primary/25"
                            : "border-border/70 bg-card/90 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                        )}
                      >
                        <GitCompare className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {isDiffToggledOn ? "Hide changes" : "Show changes from the last chat"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              {isAwaitingNewFile ? (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <p className="max-w-xs text-xs text-muted-foreground">
                    VibeCraft is writing this file. It will appear here once it&rsquo;s finished.
                  </p>
                </div>
              ) : (
                <CodeEditor
                  content={content}
                  filePath={activeTab}
                  isLoading={isLoadingFile}
                  diffOriginal={diffOriginal}
                  reveal={reveal?.path === activeTab ? reveal : null}
                  onSelectionAction={handleSelectionAction}
                />
              )}
              {isBeingWritten && !isAwaitingNewFile && (
                <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md border border-border/70 bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
                  Being updated &mdash; the new version appears when it&rsquo;s done
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {isLensOpen && (
          <>
            <ResizableHandle
              onDragging={setIsDraggingSplit}
              className="w-px bg-border/60 transition-colors hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary/70"
            />
            <ResizablePanel order={2} defaultSize={42} minSize={20} maxSize={60} className="min-w-0 overflow-hidden">
              <CodeLensPanel
                projectId={projectId}
                projectName={projectName}
                onClose={() => codeLens.close(projectId)}
                onOpenSelection={(path, line, code, endLine) => revealInFile(path, line, code, endLine)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );

});
