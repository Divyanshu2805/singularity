/**
 * A project's own page: the chat on one side, the preview and code on the other.
 *
 * Handles: loading the project, renaming it in place, switching between the preview and the code, opening a file at
 * the line a chat message points at, handing a build step to the code lens for a detailed explanation, refreshing
 * usage when a response ends, replacing the composer with the quota banner once the allowance is spent or too little
 * of it is left for the server to admit another build, saying so when a request could not be
 * sent because a response is already in progress - with a button to stop that response for someone who may edit,
 * since the one in progress may be another member's and would otherwise hold the project until it ended - bringing
 * the preview up to date when a response has changed files,
 * the publish, share, fork and delete actions, the History panel and the question asked before going back to a version,
 * Undo on a chat reply, clearing the chat, the first-run guide, and the page shown instead of all of it when the
 * project cannot be opened.
 *
 * A project that is not this person's to open - deleted, never shared with them, a wrong address - used to leave an
 * empty workspace under an error toast. It is now a page of its own that says what the possibilities are and leads
 * back to their projects; a load that failed for another reason offers to try again (lib/project-access). The chat
 * is asked for only once the project has loaded, so a stranger's visit does not also raise a chat error.
 *
 * When the files change from outside the chat - a version restored, a turn undone, a file saved by hand - the chat
 * store's copy of the files a build wrote is the stale one, so it is dropped, the code panel is told to read again,
 * and a running preview is asked about so its "Updating" shows. After a restore the preview is also reloaded once it
 * has had a moment to catch up, since a restore can swap out a page the browser is still showing.
 *
 * The guide (components/WorkspaceGuide) opens by itself once, the first time a person opens a project they can build
 * in, and afterwards only from the header's help button.
 *
 * Publish is the header's chip with its own panel (components/PublishMenu), shown to every member - the owner
 * changes it, the others see where it stands.
 *
 * After a response whose files were saved, a running preview is asked about at once, so its "Updating" shows and
 * gives way to "Up to date" as the server brings it level (the server also installs a new package by itself; this
 * page no longer asks for that), and it is reloaded
 * when it had reported an error - the page inside reports each error once per load, so without a reload a fix that
 * did not work would look exactly like one that did, and the old error screen would stay up either way. A preview
 * with no error is left alone: the dev server hot-reloads it and whatever the person was doing inside is kept. The
 * decision is lib/preview's (previewFollowUp); a response that failed or was stopped saved nothing, so it touches
 * nothing.
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
import { CircleHelp, CodeXml, Download, Eraser, Eye, FileDown, GitFork, GraduationCap, History, Pin, Star, Trash2, type LucideIcon } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { ForkProjectDialog } from "@/components/ForkProjectDialog";
import { canForkProject } from "@/lib/project-fork";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ResizablePanelGroup, ResizablePanel, ResizableGutter } from "@/components/ui/resizable";
import { ChatPanel } from "@/components/ChatPanel";
import { CodePanel, type OpenFileRequest } from "@/components/CodePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { useProjectPreview } from "@/hooks/use-preview";
import { previewFollowUp, shouldStartPreviewForBuild } from "@/lib/preview";
import { fixOffer, fixRequestFor, withFixAttempt } from "@/lib/preview-fix";
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
import { api, getUserInfo, isAuthenticated, loginRedirectPath } from "@/lib/api";
import { projectChat, useProjectChat, type ChatMessage } from "@/lib/project-chat-store";
import { projectLoadFailure, type ProjectLoadFailure } from "@/lib/project-access";
import { hasSeenGuide, markGuideSeen } from "@/lib/guide";
import { HistoryPanel } from "@/components/HistoryPanel";
import { LearnPanel } from "@/components/LearnPanel";
import { learnPanel } from "@/lib/learn-panel-store";
import { RestoreDialog, type RestoreTarget } from "@/components/RestoreDialog";
import { WorkspaceGuide } from "@/components/WorkspaceGuide";
import { Button } from "@/components/ui/button";
import { codeLens, useCodeLens, type BuildStepQuestion } from "@/lib/code-lens-store";
import type { LessonQuestion } from "@/lib/lesson";
import { useToast } from "@/hooks/use-toast";
import type { RuntimeError } from "@/components/RuntimeErrorAlert";
import { generateGradient, cn } from "@/lib/utils";
import { ProjectResponse, type ProjectSummaryResponse } from "@/lib/types";
import type { CodeTarget } from "@/lib/lesson";
import { ShareDialog } from "@/components/ShareDialog";
import { PublishMenu } from "@/components/PublishMenu";
import { buildChatMarkdown, downloadMarkdown, exportFilename } from "@/lib/chat-export";
import { deleteCopy } from "@/lib/project-delete";
import { ToastAction } from "@/components/ui/toast";
import { useBilling } from "@/hooks/use-billing";
import { ChatUsageMeter } from "@/components/ChatUsageMeter";
import { formatResetIn } from "@/lib/billing";
import { quotaStop } from "@/lib/stops";

type ViewMode = "code" | "preview";

const VIEW_OPTIONS: { mode: ViewMode; label: string; Icon: LucideIcon }[] = [
  { mode: "preview", label: "Preview", Icon: Eye },
  { mode: "code", label: "Code", Icon: CodeXml },
];

const CHAT_PANEL_PERCENT = { sidebarCollapsed: 45, sidebarPinned: 44 };
const PREVIEW_SYNC_GRACE_MS = 2500;
const CHAT_PANEL_PERCENT_WITH_NOTES = 28;

function HeaderIconButton({ label, onClick, disabled, destructive, star, guide, motion = "scale(1.14)", children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  guide?: string;
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
          data-guide={guide}
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
  const [loadFailure, setLoadFailure] = useState<ProjectLoadFailure | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [filesVersion, setFilesVersion] = useState(0);
  const [isClearChatOpen, setIsClearChatOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

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

    setLoadFailure(null);
    api.getProject(projectId)
      .then((projectData) => {
        if (isCancelled) return;
        setProject(projectData);
        projectChat.loadHistory(projectId);
      })
      .catch((error) => {
        console.error("Failed to load project:", error);
        if (!isCancelled) setLoadFailure(projectLoadFailure(error));
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId, loadAttempt]);

  useEffect(() => {
    if (!chat.historyError) return;
    toast({ title: "Couldn't load the chat", description: chat.historyError, variant: "destructive" });
  }, [chat.historyError, toast]);

  const canBuildHere = role === "OWNER" || role === "EDITOR";
  useEffect(() => {
    if (!canBuildHere || !chat.isHistoryLoaded) return;
    const userId = getUserInfo()?.id;
    if (hasSeenGuide(userId)) return;
    markGuideSeen(userId);
    setIsGuideOpen(true);
  }, [canBuildHere, chat.isHistoryLoaded]);
  const closeGuide = useCallback(() => setIsGuideOpen(false), []);

  useEffect(() => {
    if (!chat.notice || !projectId) return;
    const stopIt = async () => {
      try {
        await api.stopGeneration(projectId);
        await projectChat.loadHistory(projectId);
        toast({ title: "Stopped", description: "What it had finished is saved. You can send your request now." });
      } catch (error) {
        toast({ title: "Couldn't stop it", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      }
    };
    toast({
      title: "A response is already in progress",
      description: chat.notice,
      action: canEdit && !chat.isStreaming
        ? <ToastAction altText="Stop the response in progress" onClick={() => void stopIt()}>Stop it</ToastAction>
        : undefined,
    });
    projectChat.dismissNotice(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.notice, projectId, toast]);

  const handleOpenFile = useCallback((path: string, isFromCurrentChat: boolean, target?: CodeTarget) => {
    setViewMode("code");
    setOpenFileRequest({ path, id: Date.now(), showDiff: isFromCurrentChat, target });
  }, []);

  const handleExplainStep = useCallback((step: BuildStepQuestion) => {
    if (!projectId) return;
    setViewMode("code");
    setOpenFileRequest({ path: step.path, id: Date.now(), showDiff: false });
    codeLens.explainStep(projectId, step);
  }, [projectId]);

  const handleAskAbout = useCallback((ask: LessonQuestion) => {
    if (!projectId) return;
    setViewMode("code");
    const hasLines = !!ask.path && !!ask.code && ask.startLine !== undefined;
    if (ask.path) {
      setOpenFileRequest({
        path: ask.path,
        id: Date.now(),
        showDiff: false,
        target: hasLines ? { line: ask.startLine, endLine: ask.endLine } : undefined,
      });
    }
    codeLens.askAbout(
      projectId,
      hasLines
        ? { path: ask.path!, code: ask.code!, startLine: ask.startLine!, endLine: ask.endLine ?? ask.startLine! }
        : null,
      ask.question
    );
  }, [projectId]);

  const previewForBuildRef = useRef({ canEdit, livePreview });
  previewForBuildRef.current = { canEdit, livePreview };
  const handleSendMessage = useCallback((content: string) => {
    const sent = !!projectId && projectChat.sendMessage(projectId, content, teachingMode);
    const { canEdit: mayEdit, livePreview: live } = previewForBuildRef.current;
    if (sent && shouldStartPreviewForBuild({ canEdit: mayEdit, isLoaded: live.isLoaded, isStarting: live.isStarting, preview: live.preview })) {
      live.start().catch(() => {
      });
    }
    return sent;
  }, [projectId, teachingMode]);

  const handleStop = useCallback(() => {
    if (projectId) projectChat.stopStreaming(projectId);
  }, [projectId]);

  const handleRetry = useCallback(() => {
    if (projectId) projectChat.retryLastMessage(projectId);
  }, [projectId]);

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

  const [fixAttempts, setFixAttempts] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    setRuntimeError(null);
    setFixAttempts(new Map());
  }, [projectId]);

  const handleFixError = useCallback(() => {
    if (!runtimeError) return;
    if (!handleSendMessage(fixRequestFor(runtimeError))) return;
    setFixAttempts((attempts) => withFixAttempt(attempts, runtimeError));
    setRuntimeError(null);
  }, [runtimeError, handleSendMessage]);

  const [previewReloadSignal, setPreviewReloadSignal] = useState(0);
  const previewHadErrorRef = useRef(false);
  const previewReloadTimerRef = useRef<number>();
  useEffect(() => () => window.clearTimeout(previewReloadTimerRef.current), []);
  const handleRuntimeError = useCallback((error: RuntimeError) => {
    previewHadErrorRef.current = true;
    setRuntimeError(error);
  }, []);

  const { preview: currentPreview, refresh: refreshPreview } = livePreview;
  const wasStreamingForPreviewRef = useRef(chat.isStreaming);
  const lastTurnOutcome = chat.messages[chat.messages.length - 1]?.outcome;
  useEffect(() => {
    const finished = wasStreamingForPreviewRef.current && !chat.isStreaming;
    wasStreamingForPreviewRef.current = chat.isStreaming;
    if (!finished) return;

    const followUp = previewFollowUp(
      { outcome: lastTurnOutcome, files: chat.lastTurnFiles },
      { isRunning: currentPreview?.status === "RUNNING", hadError: previewHadErrorRef.current }
    );
    if (chat.lastTurnFiles.length > 0 && currentPreview?.status === "RUNNING") {
      refreshPreview().catch(() => {
      });
    }
    if (followUp === "none") return;
    previewHadErrorRef.current = false;
    window.clearTimeout(previewReloadTimerRef.current);
    previewReloadTimerRef.current = window.setTimeout(() => {
      setRuntimeError(null);
      setPreviewReloadSignal((signal) => signal + 1);
    }, PREVIEW_SYNC_GRACE_MS);
  }, [chat.isStreaming, chat.lastTurnFiles, lastTurnOutcome, currentPreview?.status, refreshPreview]);

  const handleFilesChanged = useCallback((paths?: readonly string[]) => {
    if (!projectId) return;
    projectChat.filesChangedOutside(projectId, paths);
    queryClient.invalidateQueries({ queryKey: ["revisions", projectId] });
    if (currentPreview?.status === "RUNNING") {
      refreshPreview().catch(() => {
      });
    }
  }, [projectId, queryClient, currentPreview?.status, refreshPreview]);

  const handleRestored = useCallback(() => {
    handleFilesChanged();
    setFilesVersion((version) => version + 1);
    setRuntimeError(null);
    if (currentPreview?.status === "RUNNING") {
      window.clearTimeout(previewReloadTimerRef.current);
      previewReloadTimerRef.current = window.setTimeout(() => setPreviewReloadSignal((signal) => signal + 1), PREVIEW_SYNC_GRACE_MS);
    }
  }, [handleFilesChanged, currentPreview?.status]);

  const handleFileSaved = useCallback((path: string) => handleFilesChanged([path]), [handleFilesChanged]);

  const handleUndoTurn = useCallback((message: ChatMessage) => {
    if (message.revisionId == null) return;
    const index = chat.messages.findIndex((candidate) => candidate.id === message.id);
    const request = index > 0 && chat.messages[index - 1].role === "user" ? chat.messages[index - 1].content : "";
    const firstLine = request.replace(/[*_`#>]/g, "").split("\n").map((line) => line.trim()).find(Boolean) ?? "this change";
    setRestoreTarget({
      revisionId: message.revisionId,
      before: true,
      title: firstLine.length > 90 ? `${firstLine.slice(0, 89).trimEnd()}…` : firstLine,
    });
  }, [chat.messages]);

  const handlePickRestore = useCallback((target: RestoreTarget) => {
    setIsHistoryOpen(false);
    setRestoreTarget(target);
  }, []);

  const handleClearChat = async () => {
    if (!projectId) return;
    try {
      await projectChat.clearChat(projectId);
      toast({ title: "Chat cleared", description: "Your files and their history are untouched." });
    } catch (error) {
      toast({
        title: "Couldn't clear the chat",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

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


  const { quota, refresh: refreshBilling } = useBilling();
  const stop = quota ? quotaStop(quota, formatResetIn(quota.resetsAt)) : null;
  const quotaBlock = stop ? { message: stop.title, detail: stop.detail, onUpgrade: () => navigate("/pricing") } : null;

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

  if (loadFailure) {
    return (
      <div className="dash-night ws-shell relative flex h-screen overflow-hidden">
        <SidebarSpacer sidebar={sidebar} />
        <div className="ws-stage relative flex min-w-0 flex-1 items-center justify-center p-6">
          <div className="chat-enter flex max-w-md flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
              <Eye className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-semibold text-foreground">{loadFailure.title}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{loadFailure.detail}</p>
            <div className="mt-2 flex items-center gap-2">
              {loadFailure.kind === "error" && (
                <Button variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
              )}
              <Button onClick={() => navigate("/projects")}>Back to your projects</Button>
            </div>
          </div>
        </div>
        <AppSidebar sidebar={sidebar} inset />
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
          canEdit={canEdit}
          filesVersion={filesVersion}
          onFileSaved={handleFileSaved}
        />
      </div>
      <div className={cn("ws-window absolute inset-0", viewMode !== "preview" && "hidden")}>
        <PreviewPanel
          projectId={projectId}
          isVisible={viewMode === "preview"}
          preview={livePreview}
          canRestart={canEdit}
          isBuilding={chat.isStreaming}
          onViewCode={() => setViewMode("code")}
          onDownload={handleDownloadProject}
          runtimeError={runtimeError}
          onRuntimeError={handleRuntimeError}
          reloadSignal={previewReloadSignal}
          onDismiss={() => setRuntimeError(null)}
          errorFix={
            canEdit && runtimeError && !chat.isStreaming
              ? { offer: fixOffer(fixAttempts, runtimeError), onFix: handleFixError }
              : null
          }
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
                  {canEdit && (
                    <HeaderIconButton label="Show me around" motion="scale(1.12)" onClick={() => setIsGuideOpen(true)} disabled={!project}>
                      <CircleHelp />
                    </HeaderIconButton>
                  )}
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
                data-guide={mode}
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

            <HeaderIconButton
              label="Learn your project"
              motion="translateY(-2px) scale(1.1)"
              onClick={() => projectId && learnPanel.open(projectId)}
              disabled={!project}
            >
              <GraduationCap />
            </HeaderIconButton>

            <HeaderIconButton
              label="History"
              guide="history"
              motion="rotate(-40deg) scale(1.08)"
              onClick={() => setIsHistoryOpen(true)}
              disabled={!project}
            >
              <History />
            </HeaderIconButton>

            {!isViewer && (
              <HeaderIconButton
                label="Clear chat"
                motion="rotate(-12deg) scale(1.08)"
                onClick={() => setIsClearChatOpen(true)}
                disabled={!hasChatToExport || chat.isStreaming}
              >
                <Eraser />
              </HeaderIconButton>
            )}

            <HeaderIconButton label="Download ZIP" motion="translateY(2px)" onClick={handleDownloadProject} disabled={!project || isDownloading}>
              {isDownloading ? <OrbitSpinner /> : <Download />}
            </HeaderIconButton>

            {!isViewer && (
              <HeaderIconButton
                label="Export as markdown"
                motion="translateY(1.5px) scale(1.08)"
                onClick={handleExportChat}
                disabled={!hasChatToExport}
              >
                <FileDown />
              </HeaderIconButton>
            )}

            {canForkProject(role) && (
              <HeaderIconButton label="Fork project" motion="rotate(-14deg) scale(1.1)" onClick={() => setIsForkDialogOpen(true)} disabled={!project}>
                <GitFork />
              </HeaderIconButton>
            )}

            {role && (
              <HeaderIconButton label={deleteText.menuLabel} destructive motion="rotate(-10deg) scale(1.1)" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 />
              </HeaderIconButton>
            )}

            <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/[0.1]" />

            <PublishMenu projectId={projectId} role={role} projectName={projectName} />

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
                  onUndoTurn={canEdit ? handleUndoTurn : undefined}
                  onExplainStep={handleExplainStep}
                  onAskAbout={handleAskAbout}
                  teachingMode={teachingMode}
                  projectId={projectId}
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

        <HistoryPanel
          projectId={projectId}
          open={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          turns={chat.messages}
          canRestore={canEdit}
          restoreBlockedReason={chat.isStreaming ? "A response is being written. You can go back to a version once it has finished." : null}
          onRestore={handlePickRestore}
        />

        <LearnPanel
          projectId={projectId}
          onOpenFile={(path) => handleOpenFile(path, false)}
          onAsk={handleAskAbout}
        />

        <RestoreDialog
          projectId={projectId}
          target={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onRestored={handleRestored}
        />

        <WorkspaceGuide open={isGuideOpen} onClose={closeGuide} />

        <AlertDialog open={isClearChatOpen} onOpenChange={setIsClearChatOpen}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Clear this chat?</AlertDialogTitle>
              <AlertDialogDescription>
                Your conversation in this project is deleted and the AI starts fresh, without what was said before.
                Your files, their History and other people&rsquo;s chats are not touched. A cleared chat can&rsquo;t be
                brought back - export it first if you want to keep it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleClearChat()} className={buttonVariants({ variant: "destructive" })}>
                Clear chat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
