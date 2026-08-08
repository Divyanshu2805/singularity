/**
 * The live preview: the project's files running in a dev server on a runner pod, loaded in an iframe from its own
 * origin.
 *
 * Handles: starting and stopping it, the start-up checklist while the runner installs, the idle countdown, the
 * runner's logs when something fails, reporting runtime errors from the page inside, and hot-reloading as the AI
 * saves files - the runner syncs them from storage, so nothing here has to push changes.
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
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CodeXml,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Monitor,
  Play,
  RotateCcw,
  RotateCw,
  ServerCrash,
  Smartphone,
  Sparkles,
  Square,
  SquareTerminal,
  Wrench,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RuntimeErrorAlert, type RuntimeError } from "@/components/RuntimeErrorAlert";
import { api, ApiRequestError, isQuotaError } from "@/lib/api";
import { MY_PREVIEWS_QUERY_KEY, type ProjectPreview } from "@/hooks/use-preview";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useToast } from "@/hooks/use-toast";
import {
  PREVIEW_STEPS,
  autoStartKey,
  describePreviewStartFailure,
  formatStopsIn,
  previewAddressFor,
  previewOrigin,
  previewStepIndex,
  shouldAutoStartPreview,
} from "@/lib/preview";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  projectId: string;
  isVisible: boolean;
  preview: ProjectPreview;
  runtimeError: RuntimeError | null;
  onRuntimeError: (error: RuntimeError) => void;
  onDismiss: () => void;
  onFix: (error: RuntimeError) => void;
  onAskToFix?: (message: string) => void;
  onViewCode: () => void;
  onDownload: () => void;
}

type Device = "desktop" | "mobile";

const LOG_POLL_MS = 3_000;

export function PreviewPanel({
  projectId,
  isVisible,
  preview: controller,
  runtimeError,
  onRuntimeError,
  onDismiss,
  onFix,
  onAskToFix,
  onViewCode,
  onDownload,
}: PreviewPanelProps) {
  const { preview, isLoaded, start, restart, stop, isStarting, isStopping, startError, resetStartError } = controller;
  const { toast } = useToast();

  const [stoppedByUser, setStoppedByUser] = useState(false);
  const lastAutoStartRef = useRef<string | null>(null);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [isFrameLoading, setIsFrameLoading] = useState(true);
  const [path, setPath] = useState("/");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setStoppedByUser(false);
    lastAutoStartRef.current = null;
    setIsLogsOpen(false);
    setPath("/");
  }, [projectId]);

  useEffect(() => {
    setIsFrameLoading(true);
    setPath("/");
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
    setStoppedByUser(false);
    runStart(start);
  };

  const handleRestart = () => {
    resetStartError();
    setIsFrameLoading(true);
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

  const handleReload = () => {
    setIsFrameLoading(true);
    setReloadKey((key) => key + 1);
  };

  const origin = previewOrigin(preview?.previewUrl);
  useEffect(() => {
    if (!origin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === "PreviewError" && data.payload) {
        onRuntimeError({
          message: String(data.payload.message ?? "Unknown error"),
          source: data.subType,
          stack: data.payload.stack,
          filename: data.payload.source,
          lineno: data.payload.lineno,
          colno: data.payload.colno,
        });
      } else if (data?.type === "PreviewLocation" && typeof data.payload?.path === "string") {
        setPath(data.payload.path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, onRuntimeError]);

  const status = preview?.status;
  const isRunning = status === "RUNNING";
  const isCreating = status === "CREATING";
  const hasLogs = !!preview && (isRunning || isCreating || status === "FAILED");

  // previewUrl carries a fresh, short-lived access token on every poll (CODE_REVIEW.md SEC-06). Snapshot it only
  // when the iframe would remount anyway - a new session or an explicit reload - so a routine background poll
  // (every RUNNING_POLL_MS) doesn't change the src prop on the live iframe and silently reload it, dropping
  // whatever the user was doing inside. The token itself doesn't need to be fresh on every poll for this to be
  // secure: the cookie the proxy already set from the first load keeps authorizing every later request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frameSrc = useMemo(() => preview?.previewUrl, [preview?.id, reloadKey]);

  let body: ReactNode;
  if (startError && !isCreating && !isRunning) {
    body = <StartErrorState error={startError} onRetry={handleStart} onDownload={onDownload} />;
  } else if (!isLoaded || (isStarting && !preview)) {
    body = <StartingState detail={null} startedAt={null} />;
  } else if (isCreating) {
    body = <StartingState detail={preview.detail} startedAt={preview.startedAt} />;
  } else if (isRunning) {
    body = (
      <div className={cn("relative flex min-h-0 flex-1 justify-center overflow-hidden", device === "mobile" && "bg-muted/30 py-4")}>
        <iframe
          ref={iframeRef}
          key={`${preview.id}-${reloadKey}`}
          src={frameSrc}
          title="Live preview"
          onLoad={() => setIsFrameLoading(false)}
          className={cn(
            "h-full border-0 bg-white",
            device === "desktop" ? "w-full" : "w-[390px] max-w-full rounded-xl shadow-lg ring-1 ring-border"
          )}
        />
        {isFrameLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 animate-in fade-in-0">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  } else if (status === "FAILED") {
    body = (
      <FailedState
        detail={preview.detail}
        projectId={projectId}
        previewId={preview.id}
        onRetry={handleStart}
        onAskToFix={onAskToFix}
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
    <div className="relative flex h-full flex-col bg-background">
      <PreviewToolbar
        preview={preview}
        path={path}
        device={device}
        onDeviceChange={setDevice}
        onReload={handleReload}
        onRestart={handleRestart}
        onStop={() => void handleStop()}
        onToggleLogs={() => setIsLogsOpen((open) => !open)}
        isLogsOpen={isLogsOpen}
        canShowLogs={hasLogs}
        isStopping={isStopping}
        isStarting={isStarting}
      />

      {body}

      {isLogsOpen && hasLogs && (
        <LogsDrawer projectId={projectId} isLive={isRunning || isCreating} onClose={() => setIsLogsOpen(false)} />
      )}

      <RuntimeErrorAlert error={runtimeError} onDismiss={onDismiss} onFix={onFix} />

      {status === "TERMINATED" || (!preview && isLoaded && !isStarting) ? (
        <div className="flex shrink-0 justify-center gap-2 pb-4">
          <Button variant="ghost" size="sm" onClick={onViewCode} className="h-7 gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
            <CodeXml /> View code
          </Button>
          <Button variant="ghost" size="sm" onClick={onDownload} className="h-7 gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
            <Download /> Download ZIP
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled, active, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
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
          className={cn("h-7 w-7 text-muted-foreground hover:text-primary [&_svg]:size-3.5", active && "bg-primary/10 text-primary")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2 py-1 text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function PreviewToolbar({
  preview,
  path,
  device,
  onDeviceChange,
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
  path: string;
  device: Device;
  onDeviceChange: (device: Device) => void;
  onReload: () => void;
  onRestart: () => void;
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
  const { address, shareableLink } = preview ? previewAddressFor(path, preview.previewUrl) : { address: null, shareableLink: null };
  const stopsIn = isRunning ? formatStopsIn(preview?.stopsAt) : null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-2 text-xs text-muted-foreground">
      <ToolbarButton label="Reload" onClick={onReload} disabled={!isRunning}>
        <RotateCw />
      </ToolbarButton>

      <div
        className="mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2"
        title={stopsIn ? `Stops after ${stopsIn} without a visit` : undefined}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            isRunning ? "bg-syntax-string" : preview?.status === "CREATING" ? "animate-pulse bg-primary" : preview?.status === "FAILED" ? "bg-destructive" : "bg-muted-foreground/40"
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {address ?? "Live preview"}
        </span>
      </div>

      <ToolbarButton label={device === "desktop" ? "Phone width" : "Full width"} onClick={() => onDeviceChange(device === "desktop" ? "mobile" : "desktop")} disabled={!isRunning} active={device === "mobile"}>
        {device === "desktop" ? <Smartphone /> : <Monitor />}
      </ToolbarButton>
      <ToolbarButton label={copied ? "Copied" : "Copy link"} onClick={() => shareableLink && void copy(shareableLink)} disabled={!isRunning}>
        {copied ? <Check className="text-syntax-string" /> : <Link2 />}
      </ToolbarButton>
      <ToolbarButton label="Open in new tab" onClick={() => shareableLink && window.open(shareableLink, "_blank", "noopener,noreferrer")} disabled={!isRunning}>
        <ExternalLink />
      </ToolbarButton>
      <ToolbarButton label={isLogsOpen ? "Hide output" : "Show output"} onClick={onToggleLogs} disabled={!canShowLogs} active={isLogsOpen && canShowLogs}>
        <SquareTerminal />
      </ToolbarButton>
      <ToolbarButton label="Reinstall and restart" onClick={onRestart} disabled={!isRunning || isStarting}>
        <RotateCcw />
      </ToolbarButton>
      {isActive && preview?.canStop && (
        <ToolbarButton label="Stop preview" onClick={onStop} disabled={isStopping}>
          {isStopping ? <Loader2 className="animate-spin" /> : <Square />}
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl border",
          tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground"
        )}
      >
        {icon}
      </div>
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function useElapsedSeconds(since: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  if (!since) return null;
  return Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
}

function StartingState({ detail, startedAt }: { detail: string | null; startedAt: string | null }) {
  const current = previewStepIndex(detail);
  const elapsed = useElapsedSeconds(startedAt);

  return (
    <CenteredState icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Starting your preview">
      <ol className="w-full max-w-[260px] space-y-2 text-left text-xs">
        {PREVIEW_STEPS.map((step, index) => {
          const isDone = index < current;
          const isCurrent = index === current;
          return (
            <li key={step.detail} className={cn("flex items-center gap-2", !isDone && !isCurrent && "text-muted-foreground/60")}>
              {isDone ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />
              ) : isCurrent ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
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
      <p className="max-w-[300px] text-[11px] leading-5 text-muted-foreground">
        {elapsed !== null ? `${elapsed}s · ` : ""}
        The first start installs every dependency, so it takes around half a minute.
      </p>
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
    <CenteredState icon={<Play className="h-5 w-5" />} title={hasStartedBefore ? "The preview isn't running" : "Preview your app"}>
      <p className="max-w-[320px] text-xs leading-5 text-muted-foreground">
        {reason && reason !== "Stopped" ? `${reason}. ` : ""}
        Start it to see the app live - it updates as the AI makes changes.
      </p>
      <Button size="sm" onClick={onStart} disabled={isStarting} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
        {isStarting ? <Loader2 className="animate-spin" /> : <Play />}
        Start preview
      </Button>
    </CenteredState>
  );
}

function FailedState({ detail, projectId, previewId, onRetry, onAskToFix, onViewCode }: {
  detail: string | null;
  projectId: string;
  previewId: number;
  onRetry: () => void;
  onAskToFix?: (message: string) => void;
  onViewCode: () => void;
}) {
  const { data: logs } = useQuery({
    queryKey: ["preview-logs", projectId, previewId],
    queryFn: () => api.getPreviewLogs(projectId),
  });
  const output = logs?.log?.trim();

  const askToFix = () => {
    if (!onAskToFix) return;
    onAskToFix(`The live preview failed to start: ${detail ?? "unknown error"}.

Here is the end of the output:

\`\`\`
${(output ?? "No output was captured.").slice(-3000)}
\`\`\`

Please find the cause in the project's files (package.json, vite.config, the entry files) and fix it.`);
  };

  return (
    <CenteredState icon={<AlertTriangle className="h-5 w-5" />} title="The preview couldn't start" tone="error">
      <p className="max-w-[360px] text-xs leading-5 text-muted-foreground">{detail ?? "Something went wrong."}</p>
      {output && (
        <pre className="max-h-48 w-full max-w-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-left font-mono text-[11px] leading-4 text-muted-foreground">
          {output.slice(-4000)}
        </pre>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {onAskToFix && (
          <Button size="sm" onClick={askToFix} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
            <Wrench /> Ask AI to fix
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onRetry} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <RotateCcw /> Try again
        </Button>
        <Button variant="ghost" size="sm" onClick={onViewCode} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
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
          <ul className="w-full max-w-[340px] divide-y divide-border/60 rounded-lg border border-border/60 text-left text-xs">
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
                  {stoppingId === item.id ? <Loader2 className="animate-spin" /> : <Square />}
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
      icon={isBusy ? <Loader2 className="h-5 w-5" /> : <ServerCrash className="h-5 w-5" />}
      title={failure.title}
      tone={isBusy ? "default" : "error"}
    >
      <p className="max-w-[340px] text-xs leading-5 text-muted-foreground">{failure.message}</p>
      {failure.hint && <p className="max-w-[340px] text-xs leading-5 text-muted-foreground/70">{failure.hint}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onRetry} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <RotateCcw /> Try again
        </Button>
        <Button variant="outline" size="sm" onClick={onDownload} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
          <Download /> Download ZIP
        </Button>
      </div>
    </CenteredState>
  );
}

function LogsDrawer({ projectId, isLive, onClose }: { projectId: string; isLive: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["preview-logs", projectId, isLive ? "live" : "saved"],
    queryFn: () => api.getPreviewLogs(projectId),
    refetchInterval: isLive ? LOG_POLL_MS : false,
  });
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [data?.log]);

  return (
    <div className="flex h-56 shrink-0 flex-col border-t border-border/60 bg-panel animate-in slide-in-from-bottom-2 fade-in-0">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
        <SquareTerminal className="h-3.5 w-3.5" />
        Output
        {isLive && <span className="text-muted-foreground/60">· live</span>}
        <button type="button" onClick={onClose} aria-label="Hide output" className="ml-auto rounded p-0.5 hover:text-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre ref={scrollRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-4 text-muted-foreground">
        {isLoading ? "Loading…" : error instanceof Error ? error.message : data?.log?.trim() || "No output yet."}
      </pre>
    </div>
  );
}
