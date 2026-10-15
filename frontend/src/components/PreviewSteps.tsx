/**
 * The steps a preview goes through while it starts, drawn as a vertical track.
 *
 * Handles: one node per step (PREVIEW_STEPS) joined by a thin line - a finished step is a gold ring holding a tick and
 * fills the line below it with gold, the step under way is the app's orbit loader (OrbitSpinner: a gold planet with a tail circling its ring) and reads in white, and the steps still to
 * come are hollow rings in a dimmer grey. The line fills downwards over most of a second as a step finishes, so
 * progress is something that travels rather than a row of text changing. Used by the preview panel; it takes the current
 * step as a number and nothing else.
 */
import { Check } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { PREVIEW_STEPS } from "@/lib/preview";
import { cn } from "@/lib/utils";

export function PreviewSteps({ current, dataShot }: { current: number; dataShot?: string }) {
  return (
    <ol data-shot={dataShot} aria-label="Starting your preview" className="w-full max-w-[250px] text-left text-[12.5px]">
      {PREVIEW_STEPS.map((step, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        const isLast = index === PREVIEW_STEPS.length - 1;
        return (
          <li
            key={step.detail}
            aria-current={isCurrent ? "step" : undefined}
            className={cn("relative flex items-start gap-3", !isLast && "h-[34px]")}
          >
            {!isLast && (
              <span aria-hidden="true" className="absolute left-[7.5px] top-[22px] h-[14px] w-px bg-white/[0.1]">
                <span
                  className="absolute inset-0 origin-top bg-gradient-to-b from-primary/80 to-primary/40 transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ transform: `scaleY(${isDone ? 1 : 0})` }}
                />
              </span>
            )}
            <span className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {isDone ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-primary/50 bg-primary/[0.16] text-primary">
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
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
