/**
 * A project's own page: the chat on one side, the preview and code on the other.
 *
 * Handles: loading the project, renaming it in place, switching between the preview and the code, opening a file at
 * the line a chat message points at, refreshing usage when a response ends, and the share, fork and delete actions.
 *
 * This is the heaviest page in the app - it pulls in the editor - which is why it is loaded on demand rather than
 * with the shell.
 */
import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCopy, CodeXml, Download, Eye, FileDown, GitFork, Loader2, Pin, Star, Trash2, type LucideIcon } from "lucide-react";
import { ForkProjectDialog } from "@/components/ForkProjectDialog";
import { canForkProject } from "@/lib/project-fork";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ChatPanel } from "@/components/ChatPanel";
import { CodePanel, type OpenFileRequest } from "@/components/CodePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { useProjectPreview } from "@/hooks/use-preview";
import { changedDependencies } from "@/lib/preview";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { AppSidebar, SidebarSpacer, SidebarToggleSpace } from "@/components/AppSidebar";
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

function HeaderIconButton({ label, onClick, disabled, destructive, active, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "h-8 w-8 text-muted-foreground [&_svg]:size-4",
            destructive ? "hover:bg-destructive/15 hover:text-destructive" : "hover:text-primary",
            active && "bg-primary/10 text-primary"
          )}
        >
          {children}
        </Button>
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
    : sidebar.isPinned
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
      const blob = await api.downloadProjectZip(projectId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project?.name || `project-${projectId}`).replace(/[^\w.-]+/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
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
          streamingFilePath={chat.streamingFilePath}
          lastTurnFiles={chat.lastTurnFiles}
          openFileRequest={openFileRequest}
          onDiffViewed={handleDiffViewed}
        />
      </div>
      <div className={cn("absolute inset-0", viewMode !== "preview" && "hidden")}>
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
    <div className="relative flex h-screen overflow-hidden bg-background">
      <SidebarSpacer sidebar={sidebar} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border/60 bg-panel px-2">
          <div className="flex min-w-0 items-center">
            <SidebarToggleSpace sidebar={sidebar} />
            {project ? (
              <div className="flex min-w-0 items-center gap-1 pl-1">
                <span className="h-5 w-5 shrink-0 rounded ring-1 ring-inset ring-white/10" style={generateGradient(projectSummary?.name ?? project.name)} />
                <EditableProjectName name={projectSummary?.name ?? project.name} canRename={canEdit} onRename={handleRename} />
                <div className="ml-1 flex shrink-0 items-center">
                  <HeaderIconButton
                    label={projectSummary?.pinnedAt ? "Unpin project" : "Pin project"}
                    active={!!projectSummary?.pinnedAt}
                    disabled={!projectSummary}
                    onClick={() => projectSummary && preferences.togglePin(projectSummary)}
                  >
                    <Pin className={cn(projectSummary?.pinnedAt && "fill-current")} />
                  </HeaderIconButton>

                  <HeaderIconButton
                    label={projectSummary?.starredAt ? "Remove star" : "Star project"}
                    active={!!projectSummary?.starredAt}
                    disabled={!projectSummary}
                    onClick={() => projectSummary && preferences.toggleStar(projectSummary)}
                  >
                    <Star className={cn(projectSummary?.starredAt && "fill-current")} />
                  </HeaderIconButton>
                </div>
              </div>
            ) : (
              <div className="ml-2 h-4 w-28 animate-pulse rounded bg-muted" />
            )}
          </div>

          <div role="tablist" aria-label="View" className="relative grid grid-cols-2 rounded-lg border border-border/60 bg-background/60 p-0.5">
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md border border-primary/40 bg-primary/15 shadow-sm transition-transform duration-200 ease-out",
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
                  "relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  viewMode === mode ? "text-primary" : "text-muted-foreground hover:text-primary"
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
                  onClick={() => void handleCopyChat()}
                  disabled={!hasChatToExport}
                >
                  {copiedChat ? <Check className="text-syntax-string" /> : <ClipboardCopy />}
                </HeaderIconButton>

                <HeaderIconButton
                  label="Export as markdown"
                  onClick={handleExportChat}
                  disabled={!hasChatToExport}
                >
                  <FileDown />
                </HeaderIconButton>
              </>
            )}

            {canForkProject(role) && (
              <HeaderIconButton label="Fork project" onClick={() => setIsForkDialogOpen(true)} disabled={!project}>
                <GitFork />
              </HeaderIconButton>
            )}

            <HeaderIconButton label="Download ZIP" onClick={handleDownloadProject} disabled={!project || isDownloading}>
              {isDownloading ? <Loader2 className="animate-spin" /> : <Download />}
            </HeaderIconButton>

            {canEdit && (
              <HeaderIconButton label={deleteText.menuLabel} destructive onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 />
              </HeaderIconButton>
            )}

            <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/70" />

            <ShareDialog projectId={projectId} canManageMembers={role === "OWNER"} />
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {isViewer ? (
            workArea
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel ref={chatPanelRef} defaultSize={chatPanelPercent} minSize={20} maxSize={65}>
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

              <ResizableHandle className="bg-border/60 transition-colors hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary/70" />

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

      <AppSidebar sidebar={sidebar} currentProjectId={projectId} />
    </div>
  );
}
