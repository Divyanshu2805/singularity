/**
 * The Publish button in a project's header, and its panel.
 *
 * Handles: for the owner, publishing the app (with an optional link name the first time), the steps of the build as
 * they happen, the live link with Copy and Open, "You have changes that are not published" with Update, switching the
 * sharing of the code on and off with the page's address to copy, Unpublish behind a confirmation, and - when a build
 * fails - the sentence that says why, what to do about it, and the output one press away. For everyone else in the
 * project it shows whether the app is published and where, and no controls. An app with a server of its own is told,
 * in the panel's foot, that a published link shows its pages only: the preview runs that server and a published app
 * is still files with nothing behind them, and a game that works in the preview and loads forever from its link is
 * worse than being told first. The file list that answers it is asked for when the panel is opened, not before.
 *
 * The header button is a round one holding only the rocket, as GitHub's beside it holds only its mark - the owner
 * asked for the icon in place of the word - with what it would do in a tooltip and a small dot on it once the app is
 * live: green when the link is up to date, gold when there are changes not yet published. The panel is drawn exactly
 * as Share's is: the same heading with one line under it, a field and the app's primary button on one row, and the
 * same foot that says in two lines who can open what - there, a private project; here, that a published app is
 * public.
 *
 * Drawn with the app's own pieces and folded until pressed, as the rest of the workspace is: a popover on the header's
 * quiet chip, the .ws-card for the build's steps (a track of nodes joined by a line that fills with gold as each step
 * finishes, the app's ripple on the one under way, and a thin bar above it - as the preview's steps are drawn), .app-chip for actions, gold only for selection. Nothing opens by
 * itself and nothing is requested until a press - the build output is fetched when "Show output" is pressed, and a build
 * is started only by the button. The one thing that moves on its own is the list of steps while a build runs, which is
 * the state the panel exists to show. The owner can stop a build under way with Cancel, in the header beside the title: the live app,
 * if there is one, stays up, and a first publish goes back to "Not published".
 *
 * A plan that is out of published apps answers with the same upgrade dialog the project and preview limits use, rather
 * than an error.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, ExternalLink, Globe, Rocket, Share2 } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { QuotaDialog } from "@/components/QuotaDialog";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useProjectPublish } from "@/hooks/use-publish";
import { useToast } from "@/hooks/use-toast";
import { ApiRequestError, api, isQuotaError } from "@/lib/api";
import {
  PUBLISH_STEPS,
  SERVER_NOTICE,
  appHasServer,
  buttonLabel,
  canPublish,
  failureAdvice,
  headline,
  isBuilding,
  isRetryableAsIs,
  linkLabel,
  publishPhase,
  shareUrl,
  slugProblem,
  stepProgress,
} from "@/lib/publish";
import type { QuotaDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<string, string> = {
  idle: "bg-white/25",
  busy: "bg-primary",
  good: "bg-syntax-string",
  warn: "bg-[hsl(38_95%_58%)]",
  bad: "bg-destructive",
};

function Steps({ step }: { step: string | null | undefined }) {
  const { index, total } = stepProgress(step);
  const reached = Math.max(index, 0);
  return (
    <div className="ws-card mb-2.5 overflow-hidden rounded-xl animate-in fade-in-0 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Build</span>
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {index >= 0 ? `${index + 1} / ${total}` : `${total} steps`}
        </span>
      </div>
      <div aria-hidden="true" className="mx-3 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary shadow-[0_0_8px_hsl(var(--primary)/0.55)] transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${((reached + (index >= 0 ? 0.5 : 0)) / total) * 100}%` }}
        />
      </div>
      <ol aria-label="Publishing steps" className="px-3 pb-2.5 pt-2.5 text-[12.5px]">
        {PUBLISH_STEPS.map((name, i) => {
          const isDone = i < index;
          const isCurrent = i === index;
          const isLast = i === PUBLISH_STEPS.length - 1;
          return (
            <li
              key={name}
              aria-current={isCurrent ? "step" : undefined}
              style={{ animationDelay: `${i * 35}ms` }}
              className={cn(
                "relative flex items-center gap-3 animate-in fade-in-0 slide-in-from-left-1 fill-mode-both duration-300 motion-reduce:animate-none",
                !isLast && "h-7"
              )}
            >
              {!isLast && (
                <span aria-hidden="true" className="absolute left-[7.5px] top-[22px] h-3 w-px bg-white/[0.1]">
                  <span
                    className="absolute inset-0 origin-top bg-gradient-to-b from-primary/80 to-primary/40 transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{ transform: `scaleY(${isDone ? 1 : 0})` }}
                  />
                </span>
              )}
              <span className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center">
                {isDone ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-primary/50 bg-primary/[0.16] text-primary animate-in zoom-in-50 duration-300 motion-reduce:animate-none">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : isCurrent ? (
                  <OrbitSpinner className="h-4 w-4" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-white/[0.14]" />
                )}
              </span>
              <span
                className={cn(
                  "leading-5 transition-colors duration-500",
                  isCurrent ? "font-medium text-foreground" : isDone ? "text-muted-foreground" : "text-muted-foreground/60"
                )}
              >
                {name}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BuildOutput({ projectId }: { projectId: string }) {
  const [log, setLog] = useState<string | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  if (log === undefined) {
    return (
      <button
        type="button"
        disabled={isLoading}
        onClick={() => {
          setIsLoading(true);
          api.getPublishLog(projectId)
            .then(setLog)
            .catch(() => setLog(null))
            .finally(() => setIsLoading(false));
        }}
        className="app-chip mt-2 inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-foreground/85 disabled:opacity-50"
      >
        <ChevronDown className="h-3 w-3" />
        Show output
      </button>
    );
  }
  return (
    <pre className="ws-card mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 font-mono text-[10.5px] leading-4 text-muted-foreground">
      {log || "There is no output saved for this build."}
    </pre>
  );
}

export function PublishMenu({ projectId, role, projectName }: { projectId: string; role: string | undefined; projectName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [quota, setQuota] = useState<QuotaDetails | null>(null);
  const [copiedLink, copyLink] = useCopyFeedback();
  const [copiedPage, copyPage] = useCopyFeedback();
  const { toast } = useToast();
  const publish = useProjectPublish(projectId, isOpen);
  const filePaths = useQuery({
    queryKey: ["publish-file-paths", projectId],
    queryFn: () => api.getFilePaths(projectId),
    enabled: isOpen,
    staleTime: 0,
    retry: false,
  });
  const hasServer = appHasServer(filePaths.data);

  const state = publish.state;
  const phase = publishPhase(state);
  const owner = canPublish(role);
  const building = isBuilding(state) || publish.isPublishing;
  const text = headline(state);
  const problem = phase === "never" ? slugProblem(slug) : null;
  const label = buttonLabel(state);

  const run = (chosen?: string) => {
    publish.publish(chosen).catch((error: unknown) => {
      if (isQuotaError(error) && error.quota) {
        setQuota(error.quota);
        return;
      }
      toast({
        title: "Couldn't start publishing",
        description: error instanceof ApiRequestError ? error.message : error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    });
  };

  const guarded = (action: Promise<unknown>, title: string) =>
    action.catch((error: unknown) =>
      toast({ title, description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    );

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Publish. ${text.title}`}
                className="btn app-chip relative flex h-8 w-8 items-center justify-center rounded-full [--light-size:2.8rem] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35 data-[state=open]:border-primary/50"
              >
                {building ? <OrbitSpinner /> : <Rocket className="h-4 w-4" />}
                {state?.live && !building && (
                  <span
                    aria-hidden="true"
                    className={cn("absolute bottom-[7px] left-[7px] h-1.5 w-1.5 rounded-full ring-1 ring-black/60", state.hasChanges ? "bg-primary" : "bg-syntax-string")}
                  />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="px-2 py-1 text-xs">
            {state?.live && !state.hasChanges && !building ? "Published" : label}
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" sideOffset={8} className="w-[320px] overflow-hidden rounded-2xl p-0">
          <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3.5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[text.tone])} />
                {text.title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{text.detail}</p>
            </div>
            {owner && building && isBuilding(state) && (
              <button
                type="button"
                disabled={publish.isCancelling}
                onClick={() => void guarded(publish.cancelBuild(), "Couldn't stop publishing")}
                className="app-chip app-chip-danger mt-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border-red-400/40 px-3 text-xs text-red-300 disabled:pointer-events-none disabled:opacity-50"
              >
                {publish.isCancelling && <OrbitSpinner className="h-3 w-3" />}
                Cancel
              </button>
            )}
            {state?.live && state.url && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="chip"
                      size="icon"
                      aria-label={copiedLink ? "Copied" : "Copy the link"}
                      onClick={() => void copyLink(state.url ?? "")}
                      className={cn("h-8 w-8 [&_svg]:size-3.5", copiedLink && "text-primary")}
                    >
                      {copiedLink ? <Check /> : <Copy />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="px-2 py-1 text-xs">{copiedLink ? "Copied" : "Copy link"}</TooltipContent>
                </Tooltip>
                {owner && (
                  <Button
                    variant="chip"
                    disabled={publish.isUnpublishing}
                    onClick={() => setConfirmUnpublish(true)}
                    className="app-chip-danger h-8 border-red-400/40 px-3 text-xs text-red-300"
                  >
                    Unpublish
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="px-3.5 pb-3.5">
            {building && (
              <Steps step={state?.build?.step} />
            )}

            {(phase === "failed" || phase === "live-failed") && state?.build && (
              <div className="mb-2.5">
                <p className="text-xs text-foreground/80">{failureAdvice(state.build.failureKind)}</p>
                {owner && <BuildOutput projectId={projectId} />}
              </div>
            )}

            {state?.live && state.url && (
              <div className="flex gap-2">
                <a
                  href={state.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open the app in a new tab"
                  title={state.url}
                  className="app-field group/link flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-sm text-foreground/90"
                >
                  <Globe aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{linkLabel(state.url)}</span>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover/link:text-primary" />
                </a>
                {owner && (state.hasChanges || phase === "live-failed") && (
                  <Button type="button" disabled={building} onClick={() => run()} className="h-9 px-4 text-xs">
                    Update
                  </Button>
                )}
              </div>
            )}

            {owner && (phase === "never" || phase === "unpublished" || phase === "failed") && (
              <div className="flex gap-2">
                {phase === "never" && (
                  <div
                    className={cn(
                      "app-field group/slug flex h-9 min-w-0 flex-1 items-center rounded-full pl-3 pr-3",
                      problem && "border-destructive/60 focus-within:border-destructive/60 focus-within:shadow-[0_0_0_3px_hsl(var(--destructive)/0.15)]"
                    )}
                  >
                    <Globe aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 transition-colors", problem ? "text-destructive" : "text-muted-foreground group-focus-within/slug:text-primary")} />
                    <input
                      id="publish-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      maxLength={40}
                      placeholder={state?.suggestedSlug ?? "my-app"}
                      aria-label="Link name"
                      aria-invalid={!!problem}
                      className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm caret-primary outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                )}
                <Button
                  variant="chip"
                  type="button"
                  disabled={building || !!problem}
                  onClick={() => run(phase === "never" ? slug : undefined)}
                  className={cn("h-9 px-4 text-xs", phase !== "never" && "w-full [--light-size:12rem]")}
                >
                  {phase === "failed" ? (isRetryableAsIs(state?.build?.failureKind) ? "Try again" : "Publish again") : "Publish"}
                </Button>
              </div>
            )}
            {problem && <p className="mt-1.5 text-xs text-destructive animate-fade-in">{problem}</p>}

            {!owner && !state?.live && (
              <p className="text-xs text-muted-foreground">Only the project's owner can publish it.</p>
            )}
          </div>

          {owner && state?.live && (
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3.5 py-2.5">
              <label
                title="Anyone with the link can read the code of this version and fork it"
                className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground/90"
              >
                <input
                  type="checkbox"
                  checked={state.shared}
                  disabled={publish.isSharing}
                  onChange={(e) => void guarded(publish.setShared(e.target.checked), "Couldn't change sharing")}
                  className="accent-[hsl(var(--primary))]"
                />
                Share the code
              </label>
              <div className="flex items-center gap-1">
                {state.shared && state.slug && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyPage(shareUrl(window.location.origin, state.slug ?? ""))}
                    className="h-7 gap-1 px-2 text-xs [&_svg]:size-3.5"
                  >
                    {copiedPage ? <Check /> : <Share2 />}
                    {copiedPage ? "Copied" : "Copy code page link"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {hasServer && (
            <div className="border-t border-white/[0.06] bg-black/15 px-4 py-2.5">
              <p className="text-[11px] text-muted-foreground">{SERVER_NOTICE}</p>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent className="sm:max-w-md" onOpenAutoFocus={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish {projectName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The link stops working at once. It stays reserved for this project, so publishing again brings the app back at
              the same address. Sharing of the code is switched off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it online</AlertDialogCancel>
            <AlertDialogAction
              variant="chip"
              className="app-chip-danger border-red-400/40 text-red-300"
              onClick={() => void guarded(publish.unpublish(), "Couldn't unpublish the app")}
            >
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuotaDialog quota={quota} onClose={() => setQuota(null)} />
    </>
  );
}
