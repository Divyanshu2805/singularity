/**
 * The code side of a project: the file tree, the open tabs and the editor.
 *
 * Handles: opening files and remembering the open tabs, showing which files the last turn changed, the diff toggle
 * and scrolling to the first change, find-in-files, copying and downloading, docking the code lens beside the
 * editor, and editing a file by hand.
 *
 * A file is read-only until someone who may edit the project presses Edit on it. Editing starts from a fresh read of
 * the file, never from the copy a build left in the browser, because a save is checked against the hash of exactly
 * what the server holds; a save the server refuses because the file changed underneath keeps what was typed and says
 * what to do. One file is edited at a time, saving is held while a response is being written (it is about to change
 * files), and leaving the page with unsaved changes asks first. A save lands as a revision, so it is in the History
 * and a running preview picks it up by itself. When the files change from outside this panel - a restore - the
 * parent bumps filesVersion and the panel drops what it had read and any tab whose file is gone.
 *
 * Whether the files column is open is a preference about the editor layout rather than anything to do with one
 * project, so it is remembered per browser.
 *
 * The files column, the editor and the code lens are each their own rounded window on the workspace's surround
 * (index.css, .ws-window), parted by gaps; the gap after the files column slides shut with it, and the one before the
 * code lens is its resize handle (ResizableGutter). The Files header and the tab strip are each window's lighter top
 * band (.ws-bar), so the two windows line up as a pair. Its toolbars use the app's
 * icon buttons (.icon-btn): quiet until the pointer reaches them, then the app's round gold wash, each icon with a
 * motion of its own - the download arrow drops, the expand chevrons stretch, the changes toggle turns - and the
 * deeper selected wash for the one that is switched on.
 */
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { memo, useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableGutter } from "@/components/ui/resizable";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, Download, GitCompare, MessagesSquare, PanelLeftClose, PanelLeftOpen, Pencil } from "lucide-react";
import { FileTree, type TreeExpansionCommand } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { FileTabs } from "./FileTabs";
import { CodeLensPanel } from "./CodeLensPanel";
import { CodeSearchPanel } from "./CodeSearchPanel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { api, ApiRequestError, buildFileTree, OPEN_TABS_KEY, ACTIVE_TAB_KEY } from "@/lib/api";
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
  lastTurnFiles: readonly string[];
  openFileRequest: OpenFileRequest | null;
  onDiffViewed: (path: string) => void;
  canEdit?: boolean;
  filesVersion?: number;
  onFileSaved?: (path: string) => void;
}

interface FileEdit {
  path: string;
  baseHash: string;
  saved: string;
  draft: string;
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
  lastTurnFiles,
  openFileRequest,
  onDiffViewed,
  canEdit = false,
  filesVersion = 0,
  onFileSaved,
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

  const [edit, setEdit] = useState<FileEdit | null>(null);
  const [isOpeningEdit, setIsOpeningEdit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = !!edit && edit.draft !== edit.saved;

  const seenFilesVersionRef = useRef(filesVersion);
  useEffect(() => {
    if (seenFilesVersionRef.current === filesVersion) return;
    seenFilesVersionRef.current = filesVersion;
    setEdit(null);
    setFetchedContents(EMPTY_CONTENTS);
    setOpenDiffPaths(new Set());
    loadTree().then((paths) => {
      if (!paths) return;
      setOpenTabs((prev) => (prev.every((path) => paths.includes(path)) ? prev : prev.filter((path) => paths.includes(path))));
      setActiveTab((active) => (active && !paths.includes(active) ? null : active));
    });
  }, [filesVersion, loadTree]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

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
  }, [projectId, activeTab, skipFetch, filesVersion]);

  const fetchedContent = activeTab ? fetchedContents.get(activeTab) : undefined;
  const isEditingActive = !!edit && edit.path === activeTab;
  const knownContent = isEditingActive ? edit.draft : completedContent ?? fetchedContent;
  const content = knownContent ?? "";
  const isAwaitingNewFile = isBeingWritten && knownContent === undefined;
  const isLoadingFile = !!activeTab && !isBeingWritten && knownContent === undefined;

  const hasDiffAvailable = !isEditingActive && activeTab ? diffBaselines.has(activeTab) : false;
  const isDiffToggledOn = activeTab ? openDiffPaths.has(activeTab) : false;
  const diffOriginal = hasDiffAvailable && isDiffToggledOn && activeTab ? diffBaselines.get(activeTab) ?? null : null;

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

  const startEditing = async () => {
    if (!activeTab || isOpeningEdit || isStreaming) return;
    const path = activeTab;
    setIsOpeningEdit(true);
    try {
      const file = await api.getFile(projectId, path);
      if (!file.hash) throw new Error("This file can't be edited right now.");
      setFetchedContents((prev) => new Map(prev).set(path, file.content));
      setOpenDiffPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      setEdit({ path, baseHash: file.hash, saved: file.content, draft: file.content });
    } catch (error) {
      toast({
        title: "Couldn't open this file for editing",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsOpeningEdit(false);
    }
  };

  const handleDraftChange = useCallback((value: string) => {
    setEdit((current) => (current && current.draft !== value ? { ...current, draft: value } : current));
  }, []);

  const saveEdit = async () => {
    if (!edit || isSaving || isStreaming || edit.draft === edit.saved) return;
    const { path, draft, baseHash } = edit;
    setIsSaving(true);
    try {
      const saved = await api.saveFile(projectId, path, draft, baseHash);
      setFetchedContents((prev) => new Map(prev).set(path, draft));
      setEdit((current) => (current && current.path === path ? { ...current, baseHash: saved.hash, saved: draft } : current));
      onFileSaved?.(path);
      toast({ title: `Saved ${splitPath(path).base}`, description: "It's in History, so you can undo it. A running preview updates by itself." });
    } catch (error) {
      const changedUnderneath = error instanceof ApiRequestError && error.status === 409;
      toast({
        title: changedUnderneath ? "This file changed while you were editing" : "Couldn't save this file",
        description: changedUnderneath
          ? "Someone else, or the AI, saved a newer version. Copy what you typed, press Discard, then Edit again to work on the newer version."
          : error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  const saveEditRef = useRef(saveEdit);
  saveEditRef.current = saveEdit;
  const handleSaveShortcut = useCallback(() => void saveEditRef.current(), []);

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
    <div className="flex h-full">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          showFileTree ? "w-[15.5rem]" : "w-0"
        )}
      >
        <div className="ws-window flex h-full w-60 flex-col">
          <div className="ws-bar flex h-11 shrink-0 items-center justify-between pl-3.5 pr-1.5">
            <span className="text-[13.5px] font-medium text-foreground/70">Files</span>
            <div className="flex items-center">
              {([
                { mode: "expand", label: "Expand all folders", Icon: ChevronsUpDown, motion: "scaleY(1.25)" },
                { mode: "collapse", label: "Collapse all folders", Icon: ChevronsDownUp, motion: "scaleY(0.75)" },
              ] as const).map(({ mode, label, Icon, motion }) => (
                <Tooltip key={mode}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={label}
                      disabled={files.length === 0}
                      onClick={() => setTreeExpansion({ mode, id: Date.now() })}
                      style={{ "--icon-hover": motion } as CSSProperties}
                      className="icon-btn h-7 w-7"
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
                    style={{ "--icon-hover": "translateX(-2px)" } as CSSProperties}
                    className="icon-btn h-7 w-7"
                  >
                    <PanelLeftClose className="panel-anim h-3.5 w-3.5" />
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
        <ResizablePanel order={1} minSize={30} className="ws-window min-w-0">
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
                        style={{ "--icon-hover": "translateX(2px)" } as CSSProperties}
                        className="icon-btn w-8"
                      >
                        <PanelLeftOpen className="panel-anim h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Show files panel</TooltipContent>
                  </Tooltip>
                ) : undefined
              }
              actions={
                activeTab ? (
                  <div className="flex shrink-0 items-center gap-0.5 border-l border-white/[0.1] pl-1.5">
                    {canEdit && !isEditingActive && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            data-guide="edit-file"
                            aria-label="Edit this file"
                            onClick={() => void startEditing()}
                            disabled={isOpeningEdit || isStreaming || isBeingWritten || (!!edit && isDirty)}
                            style={{ "--icon-hover": "rotate(-14deg)" } as CSSProperties}
                            className="icon-btn h-7 w-7"
                          >
                            {isOpeningEdit ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {isStreaming
                            ? "Wait for the response to finish, then edit"
                            : edit && isDirty
                              ? `Save or discard your changes to ${splitPath(edit.path).base} first`
                              : "Edit this file by hand"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Copy file contents"
                          onClick={handleCopyFile}
                          style={{ "--icon-hover": "translateX(1px)" } as CSSProperties}
                          className="icon-btn h-7 w-7"
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
                          style={{ "--icon-hover": "translateY(2px)" } as CSSProperties}
                          className="icon-btn h-7 w-7"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Download file</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={isLensOpen ? "Close ExplainLLM" : "Open ExplainLLM"}
                          onClick={() => (isLensOpen ? codeLens.close(projectId) : codeLens.reopen(projectId))}
                          aria-pressed={isLensOpen}
                          style={{ "--icon-hover": "rotate(-8deg)" } as CSSProperties}
                          className="icon-btn h-7 w-7"
                        >
                          <MessagesSquare className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isLensOpen ? "Close ExplainLLM" : "Open ExplainLLM"}
                      </TooltipContent>
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
                        style={{ "--icon-hover": "rotate(180deg)" } as CSSProperties}
                        className="icon-btn app-menu h-8 w-8 border"
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
                    Singularity is writing this file. It will appear here once it&rsquo;s finished.
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
                  editable={isEditingActive}
                  onChange={handleDraftChange}
                  onSave={handleSaveShortcut}
                />
              )}
              {isEditingActive && (
                <div className="app-menu chat-enter absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border p-1 pl-3.5">
                  <span className="mr-1 text-[11.5px] text-muted-foreground">
                    {isStreaming ? "Saving waits for the response" : isDirty ? "Unsaved changes" : "Editing - nothing to save yet"}
                  </span>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setEdit(null)}
                    className="btn btn-glass flex h-8 items-center rounded-full px-3.5 text-xs font-semibold text-foreground/90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
                  >
                    {isDirty ? "Discard" : "Done"}
                  </button>
                  <button
                    type="button"
                    disabled={!isDirty || isSaving || isStreaming}
                    onClick={() => void saveEdit()}
                    className="btn btn-primary flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35 disabled:opacity-50"
                  >
                    {isSaving && <OrbitSpinner className="h-3 w-3" />}
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
              {isBeingWritten && !isAwaitingNewFile && (
                <div className="app-menu chat-enter pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <OrbitSpinner className="h-3 w-3" />
                  Being updated &mdash; the new version appears when it&rsquo;s done
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {isLensOpen && (
          <>
            <ResizableGutter />
            <ResizablePanel order={2} defaultSize={42} minSize={20} maxSize={60} className="ws-window min-w-0">
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
