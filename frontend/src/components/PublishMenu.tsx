/**
 * The Publish button in a project's header, and its panel.
 *
 * Handles: for the owner, publishing the app (with an optional link name the first time), the steps of the build as
 * they happen, the live link with Copy and Open, "You have changes that are not published" with Update, switching the
 * sharing of the code on and off with the page's address to copy, Unpublish behind a confirmation, and - when a build
 * fails - the sentence that says why, what to do about it, and the output one press away. For everyone else in the
 * project it shows whether the app is published and where, and no controls.
 *
 * The header button and the panel are drawn exactly as Share's beside them are: the same glass button, the same
 * heading with one line under it, a field and the app's primary button on one row, and the same foot that says in
 * two lines who can open what - there, a private project; here, that a published app is public.
 *
 * Drawn with the app's own pieces and folded until pressed, as the rest of the workspace is: a popover on the header's
 * quiet chip, the .ws-card for the build's steps, .app-chip for actions, gold only for selection. Nothing opens by
 * itself and nothing is requested until a press - the build output is fetched when "Show output" is pressed, and a build
 * is started only by the button. The one thing that moves on its own is the list of steps while a build runs, which is
 * the state the panel exists to show.
 *
 * A plan that is out of published apps answers with the same upgrade dialog the project and preview limits use, rather
 * than an error.
 */
import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Globe, Loader2, Rocket, Share2 } from "lucide-react";
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
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useProjectPublish } from "@/hooks/use-publish";
import { useToast } from "@/hooks/use-toast";
import { ApiRequestError, api, isQuotaError } from "@/lib/api";
import {
  PUBLISH_STEPS,
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
  const { index } = stepProgress(step);
  return (
    <ol className="ws-card mb-2.5 overflow-hidden rounded-lg text-xs" aria-label="Publishing steps">
      {PUBLISH_STEPS.map((name, i) => (
        <li
          key={name}
          aria-current={i === index ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 border-b border-white/[0.06] px-2.5 py-1.5 last:border-b-0",
            i < index && "text-muted-foreground",
            i === index && "bg-[hsl(var(--ws-card-head))] text-foreground",
            i > index && "text-muted-foreground/50"
          )}
        >
          {i < index ? <Check className="h-3 w-3 text-syntax-string" /> : i === index ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <span className="h-3 w-3" />}
          {name}
        </li>
      ))}
    </ol>
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
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Publish. ${text.title}`}
            className="btn btn-glass flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35 data-[state=open]:border-primary/50"
          >
            {building ? <OrbitSpinner /> : state?.live ? <span className="h-1.5 w-1.5 rounded-full bg-syntax-string" /> : <Rocket className="h-3.5 w-3.5" />}
            {state?.live && !state.hasChanges && !building ? "Published" : label}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" sideOffset={8} className="w-[380px] overflow-hidden rounded-2xl p-0">
          <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3.5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[text.tone])} />
                {text.title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{text.detail}</p>
            </div>
            {state?.live && state.url && (
              <Button
                variant="outline"
                size="sm"
                aria-label={copiedLink ? "Copied" : "Copy the link"}
                onClick={() => void copyLink(state.url ?? "")}
                className={cn("h-8 shrink-0 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5", copiedLink && "text-primary")}
              >
                {copiedLink ? <Check /> : <Copy />}
                {copiedLink ? "Copied" : "Copy link"}
              </Button>
            )}
          </div>

          <div className="px-3.5 pb-3.5">
            {building && <Steps step={state?.build?.step} />}

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
                  className="app-field group/link flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-sm text-foreground/90 hover:text-primary"
                >
                  <Globe aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover/link:text-primary" />
                  <span className="min-w-0 flex-1 truncate">{linkLabel(state.url)}</span>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                  type="button"
                  disabled={building || !!problem}
                  onClick={() => run(phase === "never" ? slug : undefined)}
                  className={cn("h-9 px-4 text-xs", phase !== "never" && "w-full")}
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
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={publish.isUnpublishing}
                  onClick={() => setConfirmUnpublish(true)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  Unpublish
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 border-t border-white/[0.06] bg-black/15 px-4 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium">{state?.live ? "Public app" : "Public once published"}</p>
              <p className="text-[11px] text-muted-foreground">Anyone with the link can open it, no account needed.</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent className="sm:max-w-md">
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
              className={buttonVariants({ variant: "destructive" })}
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
