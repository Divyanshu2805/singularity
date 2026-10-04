/**
 * A project's own page: the chat on one side, the preview and code on the other.
 *
 * Handles: loading the project, renaming it in place, switching between the preview and the code, opening a file at
 * the line a chat message points at, refreshing usage when a response ends, and the share, fork and delete actions.
 *
 * This is the heaviest page in the app - it pulls in the editor - which is why it is loaded on demand rather than
 * with the shell.
 *
 * It is laid out the way the dashboard is, after Lovable: the docked sidebar (inset) stands on the plain surround
 * (index.css, .ws-shell), the header and every pane on a near-black stage beside it (.ws-stage), and each pane - the chat, the preview, and inside the code view the file
 * tree, the editor and the code lens - is its own rounded window (.ws-window) parted from the next by a narrow gap
 * that is also its resize handle (ui/resizable's ResizableGutter). The root carries .dash-night, so the page reads in
 * the dashboard's Inter and brighter text with unblurred glass. There is no sky here any more: every pane is opaque,
 * so the starfield it used to draw once showed nowhere but behind the header, and the blurred glass header over it is
 * gone with it. The windows step up from the surround in tone (index.css, the workspace section): they were once
 * darker than the surround they stood on and all but vanished into it, so the owner asked for every area to be told
 * apart - the surround is now the darkest thing on screen, each window lifted off it, its top band lighter again.
 *
 * Every button and row answers hover and selection with the app's one highlight (the Build/Teach menu's gold wash,
 * index.css's --hl-* variables): the header's icon buttons are .icon-btn (a round wash, red for delete), and the
 * Preview/Code switch is a sunken track whose chip (.seg-pill) is the selected wash, sliding between the two. Each
 * header icon also answers the pointer with a motion that suits it (.icon-pop, through HeaderIconButton's motion): the
 * pin tilts, the star turns, the download arrow drops, the fork leans.
 */
import { useState, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCopy, CodeXml, Download, Eye, FileDown, GitFork, Pin, Star, Trash2, type LucideIcon } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { ForkProjectDialog } from "@/components/ForkProjectDialog";
import { canForkProject } from "@/lib/project-fork";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ResizablePanelGroup, ResizablePanel, ResizableGutter } from "@/components/ui/resizable";
import { ChatPanel } from "@/components/ChatPanel";
import { CodePanel, type OpenFileRequest } from "@/components/CodePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { useProjectPreview } from "@/hooks/use-preview";
import { changedDependencies } from "@/lib/preview";
import { buttonVariants } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useProjectPreferences } from "@/hooks/use-project-preferences";
import { useTeachingMode } from "@/hooks/use-teaching-mode";
import { api, isAuthenticated, loginRedirectPath } from "@/lib/api";
import { projectChat, useProjectChat } from "@/lib/project-chat-store";
import { useCodeLens } from "@/lib/code-lens-store";
import { useToast } from "@/hooks/use-toast";
import type { RuntimeError } from "@/components/RuntimeErrorAlert";
import { generateGradient, cn } from "@/lib/utils";
import { ProjectResponse, type ProjectSummaryResponse } from "@/lib/types";
import type { CodeTarget } from "@/lib/lesson";
import { ShareDialog } from "@/components/ShareDialog";
import { buildChatMarkdown, downloadMarkdown, exportFilename } from "@/lib/chat-export";
import { deleteCopy } from "@/lib/project-delete";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useBilling } from "@/hooks/use-billing";
import { ChatUsageMeter } from "@/components/ChatUsageMeter";
import { formatResetIn, formatTokens } from "@/lib/billing";

type ViewMode = "code" | "preview";

const VIEW_OPTIONS: { mode: ViewMode; label: string; Icon: LucideIcon }[] = [
  { mode: "preview", label: "Preview", Icon: Eye },
  { mode: "code", label: "Code", Icon: CodeXml },
];

const CHAT_PANEL_PERCENT = { sidebarCollapsed: 45, sidebarPinned: 44 };
const CHAT_PANEL_PERCENT_WITH_NOTES = 28;

function HeaderIconButton({ label, onClick, disabled, destructive, star, motion = "scale(1.14)", children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  star?: boolean;
  motion?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          style={{ "--icon-hover": motion } as CSSProperties}
          className={cn("icon-btn group h-8 w-8 [&_svg]:size-4", destructive && "icon-btn-danger", star && "icon-btn-star")}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2 py-1 text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function EditableProjectName({ name, canRename, onRename }: {
  name: string;
  canRename: boolean;
  onRename: (next: string) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFinishingRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const startEditing = () => {
    if (!canRename) return;
    isFinishingRef.current = false;
    setDraft(name);
    setIsEditing(true);
  };

  const finish = async (shouldSave: boolean) => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;

    const next = draft.trim();
    if (!shouldSave || !next || next === name) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    const saved = await onRename(next);
    setIsSaving(false);
    if (saved) {
      setIsEditing(false);
    } else {
      isFinishingRef.current = false;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={255}
        disabled={isSaving}
        aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        style={{ width: `calc(${Math.max(draft.length, 8)}ch + 1.25rem)` }}
        className="h-7 min-w-0 max-w-[24rem] rounded-md border border-primary/50 bg-background px-2 text-sm font-medium text-foreground outline-none ring-[3px] ring-primary/15 disabled:opacity-70"
      />
    );
  }

  return (
    <span
      role={canRename ? "button" : undefined}
      tabIndex={canRename ? 0 : undefined}
      title={canRename ? "Double-click to rename" : undefined}
      onDoubleClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter") startEditing();
      }}
      className={cn(
        "min-w-0 truncate rounded-md px-1.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        canRename && "cursor-text hover:bg-primary/10 hover:text-primary"
      )}
    >
      {name}
    </span>
  );
}

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  return <ProjectWorkspace key={projectId} />;
}

function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sidebar = useSidebar();
  const preferences = useProjectPreferences();
  const [teachingMode, setTeachingMode] = useTeachingMode();

  const { data: projectList } = useQuery({ queryKey: ["projects"], queryFn: () => api.getProjects() });
  const projectSummary = projectList?.find((summary) => String(summary.id) === projectId);

  const chat = useProjectChat(projectId ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("code");
  const [runtimeError, setRuntimeError] = useState<RuntimeError | null>(null);
  const livePreview = useProjectPreview(projectId ?? "", viewMode === "preview");
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [openFileRequest, setOpenFileRequest] = useState<OpenFileRequest | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const initialPromptRef = useRef<string | null>(
    (location.state as { initialPrompt?: string } | null)?.initialPrompt ?? null
  );

  const role = project?.role;
  const canEdit = role === "OWNER" || role === "EDITOR";
  const isViewer = role === "VIEWER";

  const isSharedWithMe = !!role && role !== "OWNER";
  const { data: members } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => api.getProjectMembers(projectId ?? ""),
    enabled: isSharedWithMe && !!projectId,
  });
  const owner = members?.find((member) => member.role === "OWNER");

  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const lensThread = useCodeLens(projectId ?? "");
  const isNotesOpen = !!lensThread?.isOpen;
  const chatPanelPercent = isNotesOpen
    ? CHAT_PANEL_PERCENT_WITH_NOTES
    : sidebar.isExpanded
      ? CHAT_PANEL_PERCENT.sidebarPinned
      : CHAT_PANEL_PERCENT.sidebarCollapsed;
  useEffect(() => {
    chatPanelRef.current?.resize(chatPanelPercent);
  }, [chatPanelPercent]);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate(loginRedirectPath());
    }
  }, [navigate]);

  useEffect(() => {
    if (!projectId) return;
    let isCancelled = false;

    projectChat.loadHistory(projectId);
    api.getProject(projectId)
      .then((projectData) => {
        if (!isCancelled) setProject(projectData);
      })
      .catch((error) => {
        console.error("Failed to load project:", error);
        toast({
          title: "Couldn't load this project",
          description: error instanceof Error ? error.message : "Check your connection and try again.",
          variant: "destructive",
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId, toast]);

  useEffect(() => {
    if (!chat.historyError) return;
    toast({ title: "Couldn't load the chat", description: chat.historyError, variant: "destructive" });
  }, [chat.historyError, toast]);

  const handleOpenFile = useCallback((path: string, isFromCurrentChat: boolean, target?: CodeTarget) => {
    setViewMode("code");
    setOpenFileRequest({ path, id: Date.now(), showDiff: isFromCurrentChat, target });
  }, []);

  const handleSendMessage = useCallback((content: string) => {
    if (projectId) projectChat.sendMessage(projectId, content, { teachingMode });
  }, [projectId, teachingMode]);

  const handleStop = useCallback(() => {
    if (projectId) projectChat.stopStreaming(projectId);
  }, [projectId]);

  const handleRetry = useCallback(() => {
    if (projectId) projectChat.retryLastMessage(projectId, { teachingMode });
  }, [projectId, teachingMode]);

  const handleDiffViewed = useCallback((path: string) => {
    if (projectId) projectChat.markDiffViewed(projectId, path);
  }, [projectId]);

  useEffect(() => {
    if (!chat.isHistoryLoaded || !initialPromptRef.current) return;
    const prompt = initialPromptRef.current;
    initialPromptRef.current = null;
    navigate(location.pathname, { replace: true, state: null });
    handleSendMessage(prompt);
  }, [chat.isHistoryLoaded, handleSendMessage, navigate, location.pathname]);

  useEffect(() => setRuntimeError(null), [projectId]);

  const { preview: currentPreview, restart: restartPreview } = livePreview;
  const wasStreamingForPreviewRef = useRef(chat.isStreaming);
  useEffect(() => {
    const finished = wasStreamingForPreviewRef.current && !chat.isStreaming;
    wasStreamingForPreviewRef.current = chat.isStreaming;
    if (finished && currentPreview?.status === "RUNNING" && changedDependencies(chat.lastTurnFiles)) {
      restartPreview().catch(() => {
      });
    }
  }, [chat.isStreaming, chat.lastTurnFiles, currentPreview?.status, restartPreview]);

  const handleFixError = useCallback((error: RuntimeError) => {
    const prompt = `I encountered a ${error.source || "runtime error"} in my application:

Error Message: ${error.message}
${error.filename ? `File: ${error.filename}` : ''}
${error.lineno ? `Line: ${error.lineno}` : ''}

Stack Trace:
${error.stack || "No stack trace available"}

Please analyze this error and fix the code to resolve it.`;

    handleSendMessage(prompt);
    setRuntimeError(null);
  }, [handleSendMessage]);

  const handleRename = async (name: string) => {
    if (!projectId) return false;
    try {
      const updated = await api.updateProject(projectId, name);
      setProject((prev) => (prev ? { ...prev, name: updated.name } : prev));
      queryClient.setQueryData<ProjectSummaryResponse[]>(["projects"], (list) =>
        list?.map((summary) => (String(summary.id) === projectId ? { ...summary, name: updated.name } : summary))
      );
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      return true;
    } catch (error) {
      toast({
        title: "Couldn't rename project",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      return false;
    }
  };

  const deleteText = deleteCopy(role, projectSummary?.name ?? project?.name);

  const handleDeleteProject = async () => {
    if (!projectId) return;
    try {
      await api.deleteProject(projectId);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: deleteText.doneTitle });
      navigate("/projects");
    } catch (error) {
      console.error("Failed to delete:", error);
      toast({
        title: deleteText.failTitle,
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const projectName = projectSummary?.name ?? project?.name ?? "project";

  const [copiedChat, copyChat] = useCopyFeedback();

  const { quota, refresh: refreshBilling } = useBilling();
  const quotaBlock = quota?.isExhausted
    ? {
        message: `You've used today's ${formatTokens(quota.limit)} AI tokens.`,
        resetsIn: formatResetIn(quota.resetsAt),
        onUpgrade: () => navigate("/pricing"),
      }
    : null;

  const wasStreamingRef = useRef(chat.isStreaming);
  useEffect(() => {
    if (wasStreamingRef.current && !chat.isStreaming) void refreshBilling();
    wasStreamingRef.current = chat.isStreaming;
  }, [chat.isStreaming, refreshBilling]);
  const hasChatToExport = chat.isHistoryLoaded && chat.messages.length > 0;

  const chatMarkdown = () => buildChatMarkdown(chat.messages, projectName);

  const handleExportChat = () => {
    downloadMarkdown(exportFilename(projectName, "chat"), chatMarkdown());
  };

  const handleCopyChat = () => copyChat(chatMarkdown());

  const wasNotesOpenRef = useRef(isNotesOpen);
  useEffect(() => {
    if (isNotesOpen && !wasNotesOpenRef.current) {
      setViewMode("code");
      sidebar.collapse();
    }
    wasNotesOpenRef.current = isNotesOpen;
  }, [isNotesOpen, sidebar]);

  const handleDownloadProject = async () => {
    if (!projectId) return;
    setIsDownloading(true);
    try {
      const { blob, missingFileCount } = await api.downloadProjectZip(projectId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project?.name || `project-${projectId}`).replace(/[^\w.-]+/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      if (missingFileCount > 0) {
        toast({
          title: "Download incomplete",
          description: `${missingFileCount} file${missingFileCount === 1 ? "" : "s"} couldn't be included - storage didn't have ${missingFileCount === 1 ? "it" : "them"}.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to download:", error);
      toast({
        title: "Couldn't download project",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid project ID</p>
      </div>
    );
  }

  const workArea = (
    <div className="relative h-full">
      <div className={cn("absolute inset-0", viewMode !== "code" && "hidden")}>
        <CodePanel
          projectId={projectId}
          projectName={projectName}
          completedFiles={chat.completedFiles}
          deletedFiles={chat.deletedFiles}
          streamingFiles={chat.streamingFiles}
          diffBaselines={chat.diffBaselines}
          isStreaming={chat.isStreaming}
          lastTurnFiles={chat.lastTurnFiles}
          openFileRequest={openFileRequest}
          onDiffViewed={handleDiffViewed}
        />
      </div>
      <div className={cn("ws-window absolute inset-0", viewMode !== "preview" && "hidden")}>
        <PreviewPanel
          projectId={projectId}
          isVisible={viewMode === "preview"}
          preview={livePreview}
          onViewCode={() => setViewMode("code")}
          onDownload={handleDownloadProject}
          runtimeError={runtimeError}
          onRuntimeError={setRuntimeError}
          onDismiss={() => setRuntimeError(null)}
          onFix={handleFixError}
          onAskToFix={canEdit ? handleSendMessage : undefined}
        />
      </div>
    </div>
  );

  return (
    <div className="dash-night ws-shell relative flex h-screen overflow-hidden">
      <SidebarSpacer sidebar={sidebar} />

      <div className="ws-stage relative flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2">
          <div className="flex min-w-0 items-center">
            {project ? (
              <div className="flex min-w-0 items-center gap-1 pl-1">
                <span className="h-5 w-5 shrink-0 rounded ring-1 ring-inset ring-white/10" style={generateGradient(projectSummary?.name ?? project.name)} />
                <EditableProjectName name={projectSummary?.name ?? project.name} canRename={canEdit} onRename={handleRename} />
                <div className="ml-1 flex shrink-0 items-center">
                  <HeaderIconButton
                    label={projectSummary?.pinnedAt ? "Unpin project" : "Pin project"}
                    motion="rotate(-22deg) scale(1.12)"
                    disabled={!projectSummary}
                    onClick={() => projectSummary && preferences.togglePin(projectSummary)}
                  >
                    <Pin className={cn(projectSummary?.pinnedAt && "pin-active")} />
                  </HeaderIconButton>

                  <HeaderIconButton
                    label={projectSummary?.starredAt ? "Remove star" : "Star project"}
                    star
                    motion="rotate(72deg) scale(1.18)"
                    disabled={!projectSummary}
                    onClick={() => projectSummary && preferences.toggleStar(projectSummary)}
                  >
                    <Star className={cn(projectSummary?.starredAt && "fill-current")} />
                  </HeaderIconButton>
                </div>
              </div>
            ) : (
              <div className="app-skeleton ml-2 h-4 w-28 rounded" />
            )}
          </div>

          <div role="tablist" aria-label="View" className="app-track relative grid grid-cols-2 p-0.5">
            <span
              aria-hidden="true"
              className={cn(
                "seg-pill absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] transition-transform duration-[650ms] ease-[cubic-bezier(0.34,1.35,0.64,1)] motion-reduce:transition-none",
                viewMode === "code" && "translate-x-full"
              )}
            />
            {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  viewMode === mode ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 transition-colors", viewMode === mode && "text-primary")} />
                {label}
                {mode === "preview" && livePreview.preview?.status === "RUNNING" && (
                  <span aria-label="running" className="h-1.5 w-1.5 rounded-full bg-syntax-string" />
                )}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1">
            {isViewer && (
              <span className="mr-1 hidden items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground sm:flex">
                <Eye className="h-3 w-3" />
                View only
              </span>
            )}

            {!isViewer && (
              <>
                <HeaderIconButton
                  label={copiedChat ? "Copied" : "Copy as markdown"}
                  motion="scale(1.08)"
                  onClick={() => void handleCopyChat()}
                  disabled={!hasChatToExport}
                >
                  {copiedChat ? <Check className="text-syntax-string" /> : <ClipboardCopy />}
                </HeaderIconButton>

                <HeaderIconButton
                  label="Export as markdown"
                  motion="translateY(1.5px) scale(1.08)"
                  onClick={handleExportChat}
                  disabled={!hasChatToExport}
                >
                  <FileDown />
                </HeaderIconButton>
              </>
            )}

            {canForkProject(role) && (
              <HeaderIconButton label="Fork project" motion="rotate(-14deg) scale(1.1)" onClick={() => setIsForkDialogOpen(true)} disabled={!project}>
                <GitFork />
              </HeaderIconButton>
            )}

            <HeaderIconButton label="Download ZIP" motion="translateY(2px)" onClick={handleDownloadProject} disabled={!project || isDownloading}>
              {isDownloading ? <OrbitSpinner /> : <Download />}
            </HeaderIconButton>

            {canEdit && (
              <HeaderIconButton label={deleteText.menuLabel} destructive motion="rotate(-10deg) scale(1.1)" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 />
              </HeaderIconButton>
            )}

            <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/[0.1]" />

            <ShareDialog projectId={projectId} canManageMembers={role === "OWNER"} />
          </div>
        </header>

        <div className="min-h-0 flex-1 pb-2 pr-2">
          {isViewer ? (
            workArea
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel ref={chatPanelRef} defaultSize={chatPanelPercent} minSize={20} maxSize={65} className="ws-window">
                <ChatPanel
                  messages={chat.messages}
                  quotaBlock={quotaBlock}
                usageMeter={projectId ? <ChatUsageMeter projectId={projectId} isStreaming={chat.isStreaming} /> : null}
                  onSendMessage={handleSendMessage}
                  isStreaming={chat.isStreaming}
                  isLoading={!chat.isHistoryLoaded}
                  readOnly={isViewer}
                  onOpenFile={handleOpenFile}
                  sharedWith={
                    isSharedWithMe && role
                      ? { projectName: projectSummary?.name ?? project?.name ?? "", ownerName: owner?.name || owner?.username, role }
                      : null
                  }
                  onBrowseCode={() => setViewMode("code")}
                  onStop={handleStop}
                  onRetry={handleRetry}
                  teachingMode={teachingMode}
                  onTeachingModeChange={setTeachingMode}
                />
              </ResizablePanel>

              <ResizableGutter />

              <ResizablePanel defaultSize={100 - chatPanelPercent} minSize={35}>
                {workArea}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>

        <ForkProjectDialog
          project={isForkDialogOpen && project ? { id: project.id, name: projectSummary?.name ?? project.name } : null}
          onOpenChange={setIsForkDialogOpen}
        />

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteText.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteText.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteProject} className={buttonVariants({ variant: "destructive" })}>
                {deleteText.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <AppSidebar sidebar={sidebar} currentProjectId={projectId} inset />
    </div>
  );
}
