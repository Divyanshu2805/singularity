/**
 * The live preview: the project's files running in a dev server on a runner pod, loaded in an iframe from its own
 * origin.
 *
 * Handles: starting and stopping it, the start-up checklist while the runner installs, the place in the line when
 * every runner is busy, the idle countdown, the runner's output and the app's own console in one panel, reporting
 * runtime errors and a blank page from the page inside, saying whether the preview is showing the latest saved
 * change, an address bar with back and forward for apps with several pages, holding the frame to a phone's or a
 * tablet's width, and hot-reloading as the AI saves files - the runner syncs them from storage, so nothing here has
 * to push changes. The page above can ask for the frame to be reloaded, which it does after a fix for an error the
 * preview had reported.
 *
 * The frame is covered until the page inside says it is up. A frame that loaded tells the tab nothing about what it
 * loaded: one of the proxy's own pages - the runner restarting, the link run out, no route - used to sit in the
 * frame looking like the app had turned into an error. The page and the proxy's pages both say what they are
 * (lib/preview-frame), and the tab acts on it without being asked: a link that has run out is replaced and the frame
 * loaded again, a missing route makes it ask the server what happened - which is how a runner that died is noticed
 * and started again - and a restart is waited out. Only when a frame has loaded and said nothing at all, or a fresh
 * link was refused more than once, is the person told, with Reload and the output one click away.
 *
 * Back, forward and the address go to the page as messages, since a frame on another origin cannot be driven any
 * other way; the page says whether there is anywhere to go, and the buttons are live only then. Reload stays the
 * tab's own - it remounts the frame with a fresh link - so it works on a frame that has stopped answering.
 *
 * An error the page reports while a change is on its way in is held back (lib/preview's holdsPreviewErrors) and shown
 * only if it is still there once the preview is level. A response that adds a package first delivers files that
 * import it, the page fails on the import, and seconds later the server installs it and restarts: showing "The
 * preview hit an error" in between told the person about a fault that was already being dealt with.
 *
 * The starting screen shows its steps and no clock. A count of seconds was there and was taken out at the owner's
 * request.
 *
 * Restarting bounces the dev server everyone on the project shares, so the button is shown only to someone who may
 * edit; the server refuses a viewer who asks anyway.
 *
 * A start that failed because of the platform rather than the project is tried again by itself (lib/preview's
 * autoRetryDelay), and the panel goes on showing a preview that is starting; the failure is shown only once those
 * tries are used up. A failed start offers Try again and View code and nothing else: the "Ask AI to fix" button that
 * used to sit under every failure, including ones no edit could mend, was removed at the owner's request.
 *
 * Per person: it starts when you press Start, a collaborator running theirs does not start yours, and it comes back
 * by itself only if yours stopped for inactivity.
 *
 * The page inside is the user's own code on another origin, so the only channel back is a posted message - accepted
 * only from that exact origin and that exact frame.
 *
 * previewUrl carries a short-lived access token (CODE_REVIEW.md SEC-06) that the backend mints fresh on every poll;
 * the iframe's own src is memoized separately so a routine poll never re-navigates it, and "Copy link"/"Open in new
 * tab" reattach the token by hand since resolving an in-app path against the base URL otherwise drops it.
 *
 * Its toolbar is the window's lighter top band (index.css, .ws-bar) holding the app's icon buttons (.icon-btn - the
 * same round wash and switched-on look as every other toolbar; a one-off ghost button with its own fill was here
 * before), each icon with a motion of its own (reload turns, the new-tab arrow leaves up and right), and the address
 * sits in a sunken pill like a browser's. Each state - starting, stopped, failed - rises in as a centred card with a
 * Fraunces title, the app's comet marking whatever is under way. The idle ones are only a gold tile over a soft
 * light, the title and the action - the explanatory sentence under the title was removed at the owner's request, so
 * a stopped preview shows a line only when it has a real reason (an idle timeout, say).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CodeXml,
  Download,
  ExternalLink,
  Link2,
  Monitor,
  Play,
  RotateCcw,
  RotateCw,
  ServerCrash,
  Smartphone,
  Sparkles,
  Square,
  SquareTerminal,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RuntimeErrorAlert, type RuntimeError } from "@/components/RuntimeErrorAlert";
import { blankPageError, isBlankPage, type FixOffer } from "@/lib/preview-fix";
import {
  FRAME_LOADING,
  FRAME_SILENCE_MS,
  addressToPath,
  appendConsole,
  errorConsoleLine,
  frameCommand,
  frameReducer,
  navigateCommand,
  readFrameMessage,
  statusPageAction,
  statusPageCaption,
  type ConsoleLine,
  type FrameCommand,
  type FramePlace,
} from "@/lib/preview-frame";
import { api, ApiRequestError, isQuotaError } from "@/lib/api";
import { MY_PREVIEWS_QUERY_KEY, type ProjectPreview } from "@/hooks/use-preview";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useToast } from "@/hooks/use-toast";
import {
  PREVIEW_DEVICES,
  PREVIEW_SANDBOX,
  PREVIEW_STEPS,
  autoRetryDelay,
  autoStartKey,
  describePreviewStartFailure,
  holdsPreviewErrors,
  frameMissedAnUpdate,
  formatStopsIn,
  isWaitingForRunner,
  nextPreviewDevice,
  previewAddressFor,
  previewDeviceWidth,
  previewFailureTitle,
  previewOrigin,
  previewStepIndex,
  previewSync,
  queueMessage,
  shouldAutoStartPreview,
  type PreviewDevice,
  type PreviewSync,
} from "@/lib/preview";
import type { PreviewFailureKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  projectId: string;
  isVisible: boolean;
  preview: ProjectPreview;
  canRestart: boolean;
  isBuilding?: boolean;
  runtimeError: RuntimeError | null;
  onRuntimeError: (error: RuntimeError) => void;
  onDismiss: () => void;
  errorFix?: { offer: FixOffer; onFix: () => void } | null;
  onViewCode: () => void;
  onDownload: () => void;
  reloadSignal?: number;
}

type OutputTab = "server" | "console";

const LOG_POLL_MS = 3_000;
const STATUS_PAGE_THROTTLE_MS = 3_000;
const MAX_LINK_REFRESHES = 3;
const ROOT_PLACE: FramePlace = { path: "/", canGoBack: false, canGoForward: false };
const DEVICE_ICONS: Record<PreviewDevice, ReactNode> = {
  desktop: <Monitor />,
  tablet: <Tablet />,
  mobile: <Smartphone />,
};

export function PreviewPanel({
  projectId,
  isVisible,
  preview: controller,
  canRestart,
  isBuilding = false,
  runtimeError,
  onRuntimeError,
  onDismiss,
  errorFix = null,
  onViewCode,
  onDownload,
  reloadSignal = 0,
}: PreviewPanelProps) {
  const { preview, isLoaded, refresh, start, restart, stop, isStarting, isStopping, startError, resetStartError } = controller;
  const { toast } = useToast();

  const [stoppedByUser, setStoppedByUser] = useState(false);
  const lastAutoStartRef = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [outputTab, setOutputTab] = useState<OutputTab>("server");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [frame, dispatchFrame] = useReducer(frameReducer, FRAME_LOADING);
  const [place, setPlace] = useState<FramePlace>(ROOT_PLACE);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastStatusPageAtRef = useRef(0);
  const linkRefreshesRef = useRef(0);

  const [isSettling, setIsSettling] = useState(false);
  const wasBuildingRef = useRef(isBuilding);
  useEffect(() => {
    const finished = wasBuildingRef.current && !isBuilding;
    wasBuildingRef.current = isBuilding;
    if (!finished) return;
    setIsSettling(true);
    refresh().catch(() => {
    }).finally(() => setIsSettling(false));
  }, [isBuilding, refresh]);

  const holdsErrors = holdsPreviewErrors({ isBuilding, isSettling, preview });
  const holdsErrorsRef = useRef(holdsErrors);
  holdsErrorsRef.current = holdsErrors;
  const heldErrorRef = useRef<RuntimeError | null>(null);
  useEffect(() => {
    if (holdsErrors || !heldErrorRef.current) return;
    const held = heldErrorRef.current;
    heldErrorRef.current = null;
    onRuntimeError(held);
  }, [holdsErrors, onRuntimeError]);

  const runtimeErrorRef = useRef(runtimeError);
  runtimeErrorRef.current = runtimeError;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    setStoppedByUser(false);
    lastAutoStartRef.current = null;
    setRetryCount(0);
    setIsLogsOpen(false);
    setOutputTab("server");
    setConsoleLines([]);
  }, [projectId]);

  const syncedRevisionRef = useRef(preview?.syncedRevisionId ?? null);
  syncedRevisionRef.current = preview?.syncedRevisionId ?? null;
  const frameLoadRef = useRef({ since: Date.now(), revision: syncedRevisionRef.current });

  useEffect(() => {
    dispatchFrame({ type: "mounted" });
    setPlace(ROOT_PLACE);
    heldErrorRef.current = null;
    frameLoadRef.current = { since: Date.now(), revision: syncedRevisionRef.current };
  }, [preview?.id, preview?.readyAt, reloadKey]);

  useEffect(() => {
    if (preview?.status !== "RUNNING") return;
    const missed = frameMissedAnUpdate({
      loadingSince: frameLoadRef.current.since,
      revisionAtLoad: frameLoadRef.current.revision,
      revisionNow: preview.syncedRevisionId,
      now: Date.now(),
    });
    if (missed) setReloadKey((key) => key + 1);
  }, [preview?.status, preview?.syncedRevisionId]);

  useEffect(() => {
    setConsoleLines([]);
    linkRefreshesRef.current = 0;
  }, [preview?.id, preview?.readyAt]);

  const runStart = useCallback(
    (action: () => Promise<unknown>) => {
      action().catch(() => {
      });
    },
    []
  );

  useEffect(() => {
    if (isStarting || startError) return;
    if (!shouldAutoStartPreview({ isVisible, isLoaded, preview, stoppedByUser, lastAutoStartKey: lastAutoStartRef.current })) {
      return;
    }
    lastAutoStartRef.current = autoStartKey(preview);
    runStart(start);
  }, [isVisible, isLoaded, preview, stoppedByUser, isStarting, startError, start, runStart]);

  const handleStart = () => {
    resetStartError();
    setRetryCount(0);
    setStoppedByUser(false);
    runStart(start);
  };

  const handleRestart = () => {
    resetStartError();
    runStart(restart);
  };

  const handleStop = async () => {
    setStoppedByUser(true);
    try {
      await stop();
    } catch (error) {
      toast({
        title: "Couldn't stop the preview",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleReload = useCallback(() => {
    refresh().catch(() => {
    }).finally(() => setReloadKey((key) => key + 1));
  }, [refresh]);

  const handledReloadSignalRef = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal === handledReloadSignalRef.current) return;
    handledReloadSignalRef.current = reloadSignal;
    setReloadKey((key) => key + 1);
  }, [reloadSignal]);

  const handleStatusPage = useCallback((status: number) => {
    const now = Date.now();
    if (now - lastStatusPageAtRef.current < STATUS_PAGE_THROTTLE_MS) return;
    lastStatusPageAtRef.current = now;
    const needsFreshLink = statusPageAction(status) === "fresh-link";
    if (needsFreshLink && linkRefreshesRef.current >= MAX_LINK_REFRESHES) {
      dispatchFrame({ type: "gave-up" });
      return;
    }
    refresh()
      .then((fresh) => {
        if (!needsFreshLink || fresh?.status !== "RUNNING") return;
        linkRefreshesRef.current += 1;
        setReloadKey((key) => key + 1);
      })
      .catch(() => {
      });
  }, [refresh]);

  const origin = previewOrigin(preview?.previewUrl);
  useEffect(() => {
    if (!origin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframeRef.current?.contentWindow) return;
      const message = readFrameMessage(event.data);
      if (!message) return;
      switch (message.kind) {
        case "ready":
        case "location":
          linkRefreshesRef.current = 0;
          dispatchFrame({ type: "ready" });
          setPlace(message.place);
          break;
        case "error":
          if (holdsErrorsRef.current) heldErrorRef.current = message.error;
          else onRuntimeError(message.error);
          setConsoleLines((lines) => appendConsole(lines, [errorConsoleLine(message.error)]));
          break;
        case "error-cleared":
          if (heldErrorRef.current?.source === message.source) heldErrorRef.current = null;
          if (runtimeErrorRef.current?.source === message.source) onDismissRef.current();
          break;
        case "blank":
          if (holdsErrorsRef.current) heldErrorRef.current ??= blankPageError();
          else if (!runtimeErrorRef.current) onRuntimeError(blankPageError());
          break;
        case "rendered":
          if (isBlankPage(heldErrorRef.current)) heldErrorRef.current = null;
          if (isBlankPage(runtimeErrorRef.current)) onDismissRef.current();
          break;
        case "console":
          setConsoleLines((lines) => appendConsole(lines, message.lines));
          break;
        case "status-page":
          dispatchFrame({ type: "status-page", status: message.status });
          handleStatusPage(message.status);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, onRuntimeError, handleStatusPage]);

  const sendToFrame = useCallback((command: FrameCommand) => {
    if (origin) iframeRef.current?.contentWindow?.postMessage(command, origin);
  }, [origin]);

  const status = preview?.status;
  const isRunning = status === "RUNNING";
  const isCreating = status === "CREATING";
  const hasServerLogs = !!preview && (isRunning || isCreating || status === "FAILED");
  const hasLogs = hasServerLogs || consoleLines.length > 0;

  useEffect(() => {
    if (!isCreating) return;
    heldErrorRef.current = null;
    onDismissRef.current();
  }, [isCreating]);

  const isAwaitingFrame = isRunning && frame.view === "loading";
  useEffect(() => {
    if (!isAwaitingFrame) return;
    const timer = window.setTimeout(() => dispatchFrame({ type: "silence" }), FRAME_SILENCE_MS);
    return () => window.clearTimeout(timer);
  }, [isAwaitingFrame, preview?.id, preview?.readyAt, reloadKey]);

  const showOutput = useCallback((tab: OutputTab) => {
    setOutputTab(tab);
    setIsLogsOpen(true);
  }, []);

  const failureKey = isCreating || isRunning ? null : startError ? "start-error" : status === "FAILED" ? `failed-${preview?.id}` : null;
  const retryDelay =
    failureKey && isVisible && !isStarting && !stoppedByUser
      ? autoRetryDelay(retryCount, startError ? { startError } : { detail: preview?.detail, kind: preview?.failureKind })
      : null;
  const isRecovering = retryDelay !== null || (isStarting && retryCount > 0 && !isCreating && !isRunning);

  useEffect(() => {
    if (retryDelay === null) return;
    const timer = window.setTimeout(() => {
      setRetryCount((count) => count + 1);
      resetStartError();
      runStart(start);
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [retryDelay, failureKey, resetStartError, runStart, start]);

  useEffect(() => {
    if (isRunning) setRetryCount(0);
  }, [isRunning]);

  // previewUrl carries a fresh, short-lived access token on every poll (CODE_REVIEW.md SEC-06). Snapshot it only
  // when the iframe would remount anyway - a new session or an explicit reload - so a routine background poll
  // (every RUNNING_POLL_MS) doesn't change the src prop on the live iframe and silently reload it, dropping
  // whatever the user was doing inside. The token itself doesn't need to be fresh on every poll for this to be
  // secure: the cookie the proxy already set from the first load keeps authorizing every later request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frameSrc = useMemo(() => preview?.previewUrl, [preview?.id, reloadKey]);

  let body: ReactNode;
  if (isRecovering) {
    body = <StartingState detail={null} />;
  } else if (startError && !isCreating && !isRunning) {
    body = <StartErrorState error={startError} onRetry={handleStart} onDownload={onDownload} />;
  } else if (!isLoaded || (isStarting && !preview)) {
    body = <StartingState detail={null} />;
  } else if (isCreating) {
    body = isWaitingForRunner(preview)
      ? <WaitingState position={preview.queuePosition} />
      : <StartingState detail={preview.detail} />;
  } else if (isRunning) {
    const frameWidth = previewDeviceWidth(device);
    body = (
      <div className={cn("relative flex min-h-0 flex-1 justify-center overflow-hidden", frameWidth !== null && "bg-[hsl(var(--ws-well))] py-4")}>
        <iframe
          ref={iframeRef}
          key={`${preview.id}-${reloadKey}`}
          src={frameSrc}
          title="Live preview"
          sandbox={PREVIEW_SANDBOX}
          style={frameWidth !== null ? { width: frameWidth } : undefined}
          className={cn(
            "h-full border-0 bg-white",
            frameWidth === null ? "w-full" : "max-w-full rounded-2xl shadow-[0_30px_70px_-30px_rgb(0_0_0/0.9)] ring-1 ring-white/10"
          )}
        />
        {frame.view === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[hsl(var(--ws-window)/0.7)] animate-in fade-in-0">
            <OrbitSpinner className="h-6 w-6" label="Loading the preview" />
          </div>
        )}
        {frame.view === "status-page" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[hsl(var(--ws-window))] animate-in fade-in-0">
            <OrbitSpinner className="h-6 w-6" />
            <p className="text-xs text-muted-foreground">{statusPageCaption(frame.status ?? 502)}</p>
          </div>
        )}
        {frame.view === "silent" && (
          <div className="absolute inset-0 flex bg-[hsl(var(--ws-window))] animate-in fade-in-0">
            <SilentFrameState onReload={handleReload} onShowOutput={() => showOutput("server")} />
          </div>
        )}
      </div>
    );
  } else if (status === "FAILED") {
    body = (
      <FailedState
        detail={preview.detail}
        kind={preview.failureKind}
        projectId={projectId}
        previewId={preview.id}
        onRetry={handleStart}
        onViewCode={onViewCode}
      />
    );
  } else {
    body = (
      <StoppedState
        reason={stoppedByUser || !preview ? null : preview.detail}
        hasStartedBefore={!!preview}
        onStart={handleStart}
        isStarting={isStarting}
      />
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <PreviewToolbar
        preview={preview}
        origin={origin}
        place={place}
        isFrameLive={isRunning && frame.view === "app"}
        device={device}
        onDeviceChange={setDevice}
        onBack={() => sendToFrame(frameCommand("back"))}
        onForward={() => sendToFrame(frameCommand("forward"))}
        onNavigate={(path) => sendToFrame(navigateCommand(path))}
        onReload={handleReload}
        onRestart={canRestart ? handleRestart : null}
        onStop={() => void handleStop()}
        onToggleLogs={() => setIsLogsOpen((open) => !open)}
        isLogsOpen={isLogsOpen}
        canShowLogs={hasLogs}
        isStopping={isStopping}
        isStarting={isStarting}
      />

      {body}

      {isLogsOpen && hasLogs && (
        <LogsDrawer
          projectId={projectId}
          isLive={isRunning || isCreating}
          hasServerLogs={hasServerLogs}
          tab={outputTab}
          onTabChange={setOutputTab}
          consoleLines={consoleLines}
          onClearConsole={() => setConsoleLines([])}
          onClose={() => setIsLogsOpen(false)}
        />
      )}

      <RuntimeErrorAlert
        error={runtimeError}
        onDismiss={onDismiss}
        fix={errorFix}
        onShowOutput={() => showOutput(runtimeError?.source === "Build error" || isBlankPage(runtimeError) ? "server" : "console")}
      />

      {status === "TERMINATED" || (!preview && isLoaded && !isStarting) ? (
        <div className="flex shrink-0 justify-center gap-2 pb-4">
          <Button variant="outline" size="sm" onClick={onViewCode} className="h-8 gap-1.5 px-3.5 text-xs [&_svg]:size-3.5">
            <CodeXml /> View code
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload} className="h-8 gap-1.5 px-3.5 text-xs [&_svg]:size-3.5">
            <Download /> Download ZIP
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled, active, motion, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  motion?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          disabled={disabled}
          style={motion ? ({ "--icon-hover": motion } as CSSProperties) : undefined}
          className="icon-btn h-7 w-7 rounded-lg [&_svg]:size-3.5"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2 py-1 text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function SyncChip({ sync }: { sync: PreviewSync }) {
  return (
    <span
      role="status"
      title={sync.detail ?? undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap pl-2 text-[11px]",
        sync.isUpdating ? "text-primary" : "text-muted-foreground"
      )}
    >
      {sync.isUpdating ? <OrbitSpinner className="h-3 w-3" /> : <Check className="h-3 w-3 text-syntax-string" />}
      {sync.label}
    </span>
  );
}

function AddressField({ host, path, isLive, onNavigate, origin }: {
  host: string | null;
  path: string;
  isLive: boolean;
  onNavigate: (path: string) => void;
  origin: string | null;
}) {
  const [draft, setDraft] = useState(path);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setDraft(path);
  }, [path, isEditing]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = addressToPath(draft, origin);
    if (target) onNavigate(target);
    else setDraft(path);
    inputRef.current?.blur();
  };

  if (!host) {
    return <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">Live preview</span>;
  }
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 items-center font-mono text-[11px]">
      <span className="hidden shrink truncate text-muted-foreground min-[900px]:inline">{host}</span>
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setIsEditing(true);
          event.target.select();
        }}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(path);
            inputRef.current?.blur();
          }
        }}
        disabled={!isLive}
        spellCheck={false}
        autoComplete="off"
        aria-label="Address inside the preview"
        className="min-w-0 flex-1 bg-transparent text-foreground/85 outline-none placeholder:text-muted-foreground disabled:text-muted-foreground"
      />
    </form>
  );
}

function PreviewToolbar({
  preview,
  origin,
  place,
  isFrameLive,
  device,
  onDeviceChange,
  onBack,
  onForward,
  onNavigate,
  onReload,
  onRestart,
  onStop,
  onToggleLogs,
  isLogsOpen,
  canShowLogs,
  isStopping,
  isStarting,
}: {
  preview: ProjectPreview["preview"];
  origin: string | null;
  place: FramePlace;
  isFrameLive: boolean;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (path: string) => void;
  onReload: () => void;
  onRestart: (() => void) | null;
  onStop: () => void;
  onToggleLogs: () => void;
  isLogsOpen: boolean;
  canShowLogs: boolean;
  isStopping: boolean;
  isStarting: boolean;
}) {
  const [copied, copy] = useCopyFeedback();
  const isRunning = preview?.status === "RUNNING";
  const isActive = isRunning || preview?.status === "CREATING";
  const shareableLink = preview ? previewAddressFor(place.path, preview.previewUrl).shareableLink : null;
  const host = preview && origin ? new URL(origin).host : null;
  const stopsIn = isRunning ? formatStopsIn(preview?.stopsAt) : null;
  const sync = previewSync(preview);
  const nextDevice = nextPreviewDevice(device);
  const nextDeviceLabel = PREVIEW_DEVICES.find((entry) => entry.device === nextDevice)?.label ?? "Full width";

  return (
    <div className="ws-bar flex h-11 shrink-0 items-center gap-1 px-2 text-xs text-muted-foreground">
      <ToolbarButton label="Back" motion="translateX(-1.5px)" onClick={onBack} disabled={!isFrameLive || !place.canGoBack}>
        <ArrowLeft />
      </ToolbarButton>
      <ToolbarButton label="Forward" motion="translateX(1.5px)" onClick={onForward} disabled={!isFrameLive || !place.canGoForward}>
        <ArrowRight />
      </ToolbarButton>
      <ToolbarButton label="Reload" motion="rotate(180deg)" onClick={onReload} disabled={!isRunning}>
        <RotateCw />
      </ToolbarButton>

      <div
        className="app-field mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full px-3"
        title={stopsIn ? `Stops after ${stopsIn} without a visit` : undefined}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            isRunning ? "bg-syntax-string shadow-[0_0_0_3px_hsl(var(--syntax-string)/0.18)]" : preview?.status === "CREATING" ? "animate-pulse bg-primary" : preview?.status === "FAILED" ? "bg-destructive" : "bg-muted-foreground/60"
          )}
        />
        <AddressField host={isActive ? host : null} path={place.path} isLive={isFrameLive} onNavigate={onNavigate} origin={origin} />
        {sync && <SyncChip sync={sync} />}
      </div>

      <ToolbarButton label={nextDeviceLabel} motion="scale(1.15)" onClick={() => onDeviceChange(nextDevice)} disabled={!isRunning} active={device !== "desktop"}>
        {DEVICE_ICONS[nextDevice]}
      </ToolbarButton>
      <ToolbarButton label={copied ? "Copied" : "Copy link"} motion="rotate(-25deg)" onClick={() => shareableLink && void copy(shareableLink)} disabled={!isRunning}>
        {copied ? <Check className="text-syntax-string" /> : <Link2 />}
      </ToolbarButton>
      <ToolbarButton label="Open in new tab" motion="translateX(1.5px)" onClick={() => shareableLink && window.open(shareableLink, "_blank", "noopener,noreferrer")} disabled={!isRunning}>
        <ExternalLink />
      </ToolbarButton>
      <ToolbarButton label={isLogsOpen ? "Hide output" : "Show output"} motion="scale(1.08)" onClick={onToggleLogs} disabled={!canShowLogs} active={isLogsOpen && canShowLogs}>
        <SquareTerminal />
      </ToolbarButton>
      {onRestart && (
        <ToolbarButton label="Reinstall and restart" motion="rotate(-180deg)" onClick={onRestart} disabled={!isRunning || isStarting}>
          <RotateCcw />
        </ToolbarButton>
      )}
      {isActive && preview?.canStop && (
        <ToolbarButton label="Stop preview" motion="scale(0.85)" onClick={onStop} disabled={isStopping}>
          {isStopping ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Square />}
        </ToolbarButton>
      )}
    </div>
  );
}

function CenteredState({ icon, title, children, tone = "default" }: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div className="idle-state flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center">
      <div className="relative mb-1">
        {tone === "default" && <span aria-hidden="true" className="empty-glow absolute -inset-[95%]" />}
        <div
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-2xl border",
            tone === "default" && "idle-tile",
            tone === "error" ? "border-destructive/35 bg-destructive/[0.12] text-destructive" : "border-primary/30 bg-[hsl(30_11%_16%)] text-[hsl(46_100%_86%)] shadow-[0_14px_30px_-18px_hsl(32.8_100%_60%/0.6)]"
          )}
        >
          {icon}
        </div>
      </div>
      <h3 className="max-w-[420px] font-display text-[24px] font-semibold leading-tight tracking-tight text-white">{title}</h3>
      {children}
    </div>
  );
}

function StartingState({ detail }: { detail: string | null }) {
  const current = previewStepIndex(detail);

  return (
    <CenteredState icon={<OrbitSpinner className="h-6 w-6" />} title="Starting your preview">
      <ol className="w-full max-w-[260px] space-y-2 text-left text-xs">
        {PREVIEW_STEPS.map((step, index) => {
          const isDone = index < current;
          const isCurrent = index === current;
          return (
            <li key={step.detail} className={cn("flex items-center gap-2", isDone ? "text-muted-foreground" : !isCurrent && "text-muted-foreground/70")}>
              {isDone ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />
              ) : isCurrent ? (
                <OrbitSpinner className="h-3.5 w-3.5" />
              ) : (
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <span className="h-1 w-1 rounded-full bg-current" />
                </span>
              )}
              <span className={cn(isCurrent && "text-foreground")}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </CenteredState>
  );
}

function WaitingState({ position }: { position: number | null | undefined }) {
  return (
    <CenteredState icon={<OrbitSpinner className="h-6 w-6" />} title="Every runner is busy right now">
      <p className="-mt-1 max-w-[320px] text-xs leading-5 text-muted-foreground">
        {queueMessage(position)} Your preview starts by itself as soon as one is free.
      </p>
    </CenteredState>
  );
}

function SilentFrameState({ onReload, onShowOutput }: { onReload: () => void; onShowOutput: () => void }) {
  return (
    <CenteredState icon={<AlertTriangle className="h-5 w-5" />} title="The preview isn't showing your app" tone="error">
      <p className="max-w-[340px] text-xs leading-5 text-muted-foreground">
        The page loaded but the app never answered. Reloading usually brings it back; the output says what the dev
        server is doing.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={onReload} style={{ "--icon-hover": "rotate(180deg)" } as CSSProperties} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <RotateCw /> Reload
        </Button>
        <Button variant="outline" size="sm" onClick={onShowOutput} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <SquareTerminal /> Show output
        </Button>
      </div>
    </CenteredState>
  );
}

function StoppedState({ reason, hasStartedBefore, onStart, isStarting }: {
  reason: string | null | undefined;
  hasStartedBefore: boolean;
  onStart: () => void;
  isStarting: boolean;
}) {
  return (
    <CenteredState icon={<Play className="h-5 w-5 translate-x-px" />} title={hasStartedBefore ? "The preview isn't running" : "Preview your app"}>
      {reason && reason !== "Stopped" && (
        <p className="-mt-1 max-w-[320px] text-xs leading-5 text-muted-foreground">{reason}</p>
      )}
      <Button size="sm" onClick={onStart} disabled={isStarting} className="btn-invite mt-1 h-9 gap-1.5 px-5 text-[13px] [&_svg]:size-3.5">
        {isStarting ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Play />}
        Start preview
      </Button>
    </CenteredState>
  );
}

function FailedState({ detail, kind, projectId, previewId, onRetry, onViewCode }: {
  detail: string | null;
  kind: PreviewFailureKind | null | undefined;
  projectId: string;
  previewId: number;
  onRetry: () => void;
  onViewCode: () => void;
}) {
  const { data: logs } = useQuery({
    queryKey: ["preview-logs", projectId, previewId],
    queryFn: () => api.getPreviewLogs(projectId),
  });
  const output = logs?.log?.trim();

  return (
    <CenteredState icon={<AlertTriangle className="h-5 w-5" />} title={previewFailureTitle(kind)} tone="error">
      <p className="max-w-[360px] text-xs leading-5 text-muted-foreground">{detail ?? "Something went wrong."}</p>
      {output && (
        <pre className="max-h-48 w-full max-w-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.1] bg-[hsl(var(--ws-well))] p-3 text-left font-mono text-[11px] leading-4 text-muted-foreground">
          {output.slice(-4000)}
        </pre>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} style={{ "--icon-hover": "rotate(-180deg)" } as CSSProperties} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <RotateCcw /> Try again
        </Button>
        <Button variant="outline" size="sm" onClick={onViewCode} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <CodeXml /> View code
        </Button>
      </div>
    </CenteredState>
  );
}

function StartErrorState({ error, onRetry, onDownload }: { error: unknown; onRetry: () => void; onDownload: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isPreviewLimit = isQuotaError(error) && error.quota?.reason === "PREVIEW_LIMIT";

  const { data: running } = useQuery({
    queryKey: MY_PREVIEWS_QUERY_KEY,
    queryFn: () => api.getMyPreviews(),
    enabled: isPreviewLimit,
  });
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  if (isPreviewLimit) {
    const quota = (error as ApiRequestError).quota!;
    const stopAndRetry = async (projectId: number, previewId: number) => {
      setStoppingId(previewId);
      try {
        await api.stopPreview(projectId);
        await queryClient.invalidateQueries({ queryKey: MY_PREVIEWS_QUERY_KEY });
        onRetry();
      } finally {
        setStoppingId(null);
      }
    };

    return (
      <CenteredState icon={<Sparkles className="h-5 w-5 text-primary" />} title={`The ${quota.planName} plan runs ${quota.limit} live ${quota.limit === 1 ? "preview" : "previews"} at a time`}>
        <p className="max-w-[340px] text-xs leading-5 text-muted-foreground">
          Stop one that's running to open this one, or upgrade to keep more going at once.
        </p>
        {running && running.length > 0 && (
          <ul className="ws-card w-full max-w-[340px] divide-y divide-white/[0.08] overflow-hidden rounded-xl text-left text-xs">
            {running.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.status === "RUNNING" ? "bg-syntax-string" : "animate-pulse bg-primary")} />
                <span className="min-w-0 flex-1 truncate">{item.projectName ?? `Project ${item.projectId}`}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stoppingId !== null}
                  onClick={() => void stopAndRetry(item.projectId, item.id)}
                  className="h-7 gap-1 px-2 text-[11px] [&_svg]:size-3"
                >
                  {stoppingId === item.id ? <OrbitSpinner className="h-3 w-3" /> : <Square />}
                  Stop &amp; open this
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" onClick={() => navigate("/pricing")} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <Sparkles /> See plans
        </Button>
      </CenteredState>
    );
  }

  const failure = describePreviewStartFailure(error);
  const isBusy = failure.kind === "busy";

  return (
    <CenteredState
      icon={isBusy ? <OrbitSpinner className="h-6 w-6" /> : <ServerCrash className="h-5 w-5" />}
      title={failure.title}
      tone={isBusy ? "default" : "error"}
    >
      <p className="max-w-[340px] text-xs leading-5 text-muted-foreground">{failure.message}</p>
      {failure.hint && <p className="max-w-[340px] text-xs leading-5 text-muted-foreground/70">{failure.hint}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onRetry} style={{ "--icon-hover": "rotate(-180deg)" } as CSSProperties} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <RotateCcw /> Try again
        </Button>
        <Button variant="outline" size="sm" onClick={onDownload} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <Download /> Download ZIP
        </Button>
      </div>
    </CenteredState>
  );
}

const CONSOLE_LEVEL_CLASS: Record<ConsoleLine["level"], string> = {
  log: "text-foreground/80",
  info: "text-foreground/80",
  debug: "text-muted-foreground",
  warn: "text-primary",
  error: "text-destructive",
};

function LogsDrawer({ projectId, isLive, hasServerLogs, tab, onTabChange, consoleLines, onClearConsole, onClose }: {
  projectId: string;
  isLive: boolean;
  hasServerLogs: boolean;
  tab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
  consoleLines: readonly ConsoleLine[];
  onClearConsole: () => void;
  onClose: () => void;
}) {
  const activeTab: OutputTab = hasServerLogs ? tab : "console";
  const { data, isLoading, error } = useQuery({
    queryKey: ["preview-logs", projectId, isLive ? "live" : "saved"],
    queryFn: () => api.getPreviewLogs(projectId),
    refetchInterval: isLive && activeTab === "server" ? LOG_POLL_MS : false,
    enabled: hasServerLogs && activeTab === "server",
  });
  const scrollRef = useRef<HTMLPreElement>(null);
  const consoleErrors = consoleLines.filter((line) => line.level === "error").length;

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [data?.log, consoleLines, activeTab]);

  const tabButton = (value: OutputTab, label: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === value}
      onClick={() => onTabChange(value)}
      className={cn(
        "rounded-md px-2 py-1 transition-colors",
        activeTab === value ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-56 shrink-0 flex-col bg-[hsl(var(--ws-well))] animate-in slide-in-from-bottom-2 fade-in-0 duration-300">
      <div className="ws-bar ws-bar-top flex h-9 shrink-0 items-center gap-2 px-3 text-[11px] font-medium text-foreground/85">
        <SquareTerminal className="h-3.5 w-3.5" />
        <div role="tablist" aria-label="Output" className="flex items-center gap-1">
          {hasServerLogs && tabButton("server", "Server")}
          {tabButton("console", (
            <span className="flex items-center gap-1.5">
              Console
              {consoleErrors > 0 && (
                <span className="rounded-full bg-destructive/20 px-1.5 text-[10px] tabular-nums text-destructive">{consoleErrors}</span>
              )}
            </span>
          ))}
        </div>
        {isLive && activeTab === "server" && (
          <span className="flex items-center gap-1.5 font-normal text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-syntax-string" />
            live
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {activeTab === "console" && consoleLines.length > 0 && (
            <button type="button" onClick={onClearConsole} aria-label="Clear the console" style={{ "--icon-hover": "scale(0.85)" } as CSSProperties} className="icon-btn h-6 w-6 rounded-md">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Hide output" style={{ "--icon-hover": "scale(0.8)" } as CSSProperties} className="icon-btn h-6 w-6 rounded-md">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <pre ref={scrollRef} role="tabpanel" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11.5px] leading-[1.6] text-foreground/80">
        {activeTab === "server"
          ? isLoading ? "Loading…" : error instanceof Error ? error.message : data?.log?.trim() || "No output yet."
          : consoleLines.length === 0
            ? "Nothing yet. What the app writes with console.log, and any error it throws, shows up here."
            : consoleLines.map((line, index) => (
              <span key={index} className={cn("block", CONSOLE_LEVEL_CLASS[line.level])}>{line.text}</span>
            ))}
      </pre>
    </div>
  );
}
