/**
 * What a project's page shows before it has a project to show: the workspace sketched while it opens, and the page
 * that stands in for all of it when it cannot be opened.
 *
 * Handles: WorkspaceSkeleton - the chat window and the work window drawn in the app's shimmer (.app-skeleton) at the
 * width the chat will open at, a reply and a request sketched in the chat over its composer, a file tree and lines of
 * code in the work window, each part fading up in turn, and in the middle of the work window the app's working indicator with
 * "Opening your project", which only fades up after a pause (.app-loading) so a quick load never flashes it.
 * ProjectUnavailable - the failure in the 404 page's language (pages/NotFound): the horizon mark building itself in
 * its glow over a slow bloom, a mono eyebrow, a Fraunces heading whose closing words are set in the sweeping gold,
 * the sentence that explains, and the way forward rising in after it. A load that failed for a reason worth retrying
 * has a Try again that shows the app's working indicator while the next attempt runs (the mark itself stands alone, with
 * no orbit round it, as the owner asked);
 * when that attempt fails as well the card nudges sideways (.load-fail-nudge), so the person can see that it was tried.
 * It fills whatever it is put in (w-full flex-1): inside the workspace's stage, a row, it used to shrink to its own
 * width and sit against the left edge, beside the sidebar, rather than in the middle of the page.
 *
 * It was a grey eye icon and two lines of text dropped into the middle of the stage, and an empty workspace under
 * it while the project loaded, so a failure looked like a page that had not finished drawing. The skeleton follows
 * ThaparGenie's conversation page, which sketches the thread it is about to show.
 */
import type { CSSProperties } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Button } from "@/components/ui/button";
import type { ProjectLoadFailure } from "@/lib/project-access";
import { cn } from "@/lib/utils";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

const CODE_LINES = [38, 62, 54, 0, 70, 46, 82, 58, 0, 40, 66, 74, 30, 0, 52, 64];

export function WorkspaceSkeleton({ chatPercent, showChat }: { chatPercent: number; showChat: boolean }) {
  return (
    <div aria-busy="true" aria-label="Opening your project" className="flex h-full gap-2">
      {showChat && (
        <div className="ws-window ws-window-black app-fade flex min-w-0 flex-col p-4" style={{ width: `${chatPercent}%`, ...step(0) }}>
          <div className="flex-1 space-y-7 pt-4">
            <div className="app-fade ml-auto h-10 w-3/5 rounded-2xl app-skeleton" style={step(1)} />
            <div className="app-fade flex gap-3" style={step(2)}>
              <div className="app-skeleton h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2.5">
                <div className="app-skeleton h-3 w-full rounded" />
                <div className="app-skeleton h-3 w-11/12 rounded" />
                <div className="app-skeleton h-3 w-3/5 rounded" />
              </div>
            </div>
            <div className="app-fade ml-auto h-8 w-2/5 rounded-2xl app-skeleton" style={step(3)} />
          </div>
          <div className="app-fade app-skeleton h-24 rounded-2xl" style={step(4)} />
        </div>
      )}

      <div className="ws-window app-fade relative flex min-w-0 flex-1 overflow-hidden" style={step(1)}>
        <div className="hidden w-52 shrink-0 space-y-3 border-r border-white/[0.06] p-4 md:block">
          {[64, 48, 72, 56, 40, 60].map((width, index) => (
            <div key={index} className="app-fade flex items-center gap-2.5" style={{ ...step(2 + index), paddingLeft: index % 3 === 2 ? 14 : 0 }}>
              <div className="app-skeleton h-3.5 w-3.5 rounded-[4px]" />
              <div className="app-skeleton h-2.5 rounded" style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-5">
          {CODE_LINES.map((width, index) =>
            width ? (
              <div key={index} className="app-fade flex items-center gap-4" style={step(3 + Math.floor(index / 3))}>
                <span className="w-5 text-right font-mono text-[10px] text-white/[0.12]">{index + 1}</span>
                <div className="app-skeleton h-2.5 rounded" style={{ width: `${width}%` }} />
              </div>
            ) : (
              <div key={index} className="h-2.5" />
            ),
          )}
        </div>

        <div role="status" aria-label="Opening your project" className="app-loading pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-3 rounded-full border border-white/[0.07] bg-black/50 px-4 py-2 backdrop-blur-md">
            <OrbitSpinner className="h-4 w-4" />
            <span aria-hidden="true" className="text-shimmer font-mono text-[10.5px] uppercase tracking-[0.26em]">
              Opening your project
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface ProjectUnavailableProps {
  failure: ProjectLoadFailure;
  attempt: number;
  isRetrying: boolean;
  onRetry: () => void;
  onBack: () => void;
}

export function ProjectUnavailable({ failure, attempt, isRetrying, onRetry, onBack }: ProjectUnavailableProps) {
  const lead = failure.title.slice(0, failure.title.length - failure.accent.length).trimEnd();
  const isError = failure.kind === "error";

  return (
    <div className="relative flex h-full w-full min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
      <span aria-hidden="true" className="app-bloom absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full" />

      <div key={attempt} role="alert" className={cn("relative flex max-w-md flex-col items-center text-center", attempt > 0 && "load-fail-nudge")}>
        <span className="app-fade relative mb-7 inline-flex h-16 w-16 items-center justify-center" style={step(0)}>
          <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
          <HorizonMark drawn className="relative h-12 w-12" />
        </span>

        <p className="app-eyebrow app-fade" style={step(1)}>
          {failure.eyebrow}
        </p>

        <h1
          className="landing-heading app-fade mt-4 font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[38px]"
          style={step(2)}
        >
          {lead}{" "}
          <em className="heat-text animate-heat-sweep pr-1 font-medium motion-reduce:animate-none">{failure.accent}</em>
        </h1>

        <p className="app-fade mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground" style={step(3)}>
          {failure.detail}
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {isError && (
            <Button
              variant="chip"
              onClick={onRetry}
              disabled={isRetrying}
              style={{ ...step(4), "--icon-hover": "rotate(-50deg)" } as CSSProperties}
              className="app-rise gap-1.5"
            >
              {isRetrying ? <OrbitSpinner /> : <RotateCcw />}
              {isRetrying ? "Trying again" : "Try again"}
            </Button>
          )}
          <Button
            variant="chip"
            onClick={onBack}
            style={{ ...step(isError ? 5 : 4), "--icon-hover": "translateX(-2px)" } as CSSProperties}
            className="app-rise gap-1.5"
          >
            <ArrowLeft />
            Back to your projects
          </Button>
        </div>
      </div>
    </div>
  );
}
