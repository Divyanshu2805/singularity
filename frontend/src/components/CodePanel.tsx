/**
 * The code side of a project: the file tree, the open tabs and the editor.
 *
 * Handles: opening files and remembering the open tabs, showing which files the last turn changed, the diff toggle
 * and scrolling to the first change, find-in-files, copying and downloading, and docking the code lens beside the
 * editor.
 *
 * Whether the files column is open is a preference about the editor layout rather than anything to do with one
 * project, so it is remembered per browser.
 */
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

const FILE_TREE_VISIBLE_KEY = "code_panel_files_visible";
const COPY_FEEDBACK_MS = 1500;

export interface OpenFileRequest {
  path: string;
  id: number;
  showDiff: boolean;
  target?: CodeTarget;
}

interface CodePanelProps {
  projectId: string;
  projectName: string;
  completedFiles: ReadonlyMap<string, string>;
  deletedFiles?: ReadonlySet<string>;
  streamingFiles: ReadonlyMap<string, string>;
  diffBaselines: ReadonlyMap<string, string>;
  isStreaming: boolean;
  streamingFilePath: string | null;
  lastTurnFiles: readonly string[];
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
  const [fetchedContents, setFetchedContents] = useState<ReadonlyMap<string, string>>(EMPTY_CONTENTS);
  const [treeExpansion, setTreeExpansion] = useState<TreeExpansionCommand | null>(null);
  const [showFileTree, setShowFileTree] = useState(() => localStorage.getItem(FILE_TREE_VISIBLE_KEY) !== "false");
  const [searchQuery, setSearchQuery] = useState("");
  const lensThread = useCodeLens(projectId);
  const isLensOpen = !!lensThread?.isOpen;

  useEffect(() => {
    codeLens.restore(projectId);
  }, [projectId]);

  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const copyResetRef = useRef<number>();
  const [openDiffPaths, setOpenDiffPaths] = useState<ReadonlySet<string>>(new Set());
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

  const files = useMemo(() => {
    const paths = new Set(serverPaths);
    deletedFiles?.forEach((path) => paths.delete(path));
    completedFiles.forEach((_, path) => paths.add(path));
    return buildFileTree([...paths]);
  }, [serverPaths, completedFiles, deletedFiles]);

  useEffect(() => {
    if (!deletedFiles || deletedFiles.size === 0) return;
    setOpenTabs((prev) => (prev.some((path) => deletedFiles.has(path)) ? prev.filter((path) => !deletedFiles.has(path)) : prev));
    setActiveTab((active) => (active && deletedFiles.has(active) ? null : active));
  }, [deletedFiles]);

  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (!wasStreamingRef.current && isStreaming) setViewedPaths(new Set());
    if (wasStreamingRef.current && !isStreaming) {
      const changed = lastTurnFilesRef.current;
      if (changed.length > 0) setOpenTabs((prev) => changed.reduce(addTab, prev));
      loadTree();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, loadTree]);

  const [reveal, setReveal] = useState<(CodeTarget & { path: string; id: number }) | null>(null);

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

  const completedContent = activeTab ? completedFiles.get(activeTab) : undefined;
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
  const isAwaitingNewFile = isBeingWritten && knownContent === undefined;
  const isLoadingFile = !!activeTab && !isBeingWritten && knownContent === undefined;

  const hasDiffAvailable = activeTab ? diffBaselines.has(activeTab) : false;
  const isDiffToggledOn = activeTab ? openDiffPaths.has(activeTab) : false;
  const diffOriginal = hasDiffAvailable && isDiffToggledOn && activeTab ? diffBaselines.get(activeTab) ?? null : null;
  const isShowingDiff = diffOriginal !== null;

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
    if (line) setReveal({ path: activeTab, line, id: Date.now() });
  }, [activeTab, openDiffPaths, diffBaselines, content]);

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

  const revealInFile = useCallback((path: string, line: number, code?: string, endLine?: number) => {
    setOpenTabs((prev) => addTab(prev, path));
    setActiveTab(path);
    setReveal({ path, line, code, endLine, id: Date.now() });
  }, []);

  const handleOpenMatch = useCallback((path: string, line: number, text: string) => {
    revealInFile(path, line, text);
  }, [revealInFile]);

  const handleSelectionAction = useCallback((selection: CodeSelection, action: "explain" | "ask") => {
    codeLens.open(projectId, selection, { explain: action === "explain" });
  }, [projectId]);

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
