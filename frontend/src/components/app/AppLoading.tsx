/**
 * The whole-page loading state: the app's night, and the horizon mark building itself in the middle of it.
 *
 * Handles: the mark drawing itself and then breathing in its glow, with nothing circling it (the owner asked for the
 * black hole alone, without the orbiting planet that used to ring it), over the same star sky and ember light as the error pages (StarSky), and a shimmering mono label over a thin sweeping bar, announced as a status.
 * A wait that runs long - a page's code that has not arrived after eight seconds - says so, quietly, under the bar and
 * offers a reload, instead of leaving the person looking at a loader that may never finish.
 *
 * The mark, sky and label only fade up after a short pause (index.css, .app-loading), so a page that arrives quickly -
 * most of them, once their code is cached - shows nothing but the night for its moment instead of flashing a loader.
 */
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { StarSky } from "@/components/app/StarSky";
import { HorizonMark } from "@/components/HorizonMark";
import { cn } from "@/lib/utils";

const SLOW_AFTER_MS = 8000;

export function AppLoading({ label = "Loading", className }: { label?: string; className?: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div data-app-loading className={cn("relative flex min-h-screen items-center justify-center overflow-hidden bg-background", className)}>
      <div className="app-loading absolute inset-0">
        <StarSky />
      </div>
      <div role="status" aria-label={label} className="app-loading relative flex flex-col items-center gap-7">
        <span className="relative inline-flex h-28 w-28 items-center justify-center">
          <span
            aria-hidden="true"
            className="sky-halo pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[44rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
          <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[40%] rounded-full" />
          <HorizonMark drawn className="relative h-12 w-12" />
        </span>
        <span className="flex flex-col items-center gap-3">
          <span aria-hidden="true" className="text-shimmer font-mono text-[11px] uppercase tracking-[0.3em]">
            {label}
          </span>
          <span aria-hidden="true" className="app-loading-bar relative block h-px w-36 overflow-hidden rounded-full bg-white/[0.08]" />
        </span>
        {slow && (
          <span className="app-fade absolute left-1/2 top-full mt-8 flex w-64 -translate-x-1/2 flex-col items-center gap-3 text-center">
            <span className="text-xs leading-relaxed text-muted-foreground">This is taking longer than it should.</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="app-chip inline-flex h-8 items-center gap-1.5 border border-white/[0.12] px-3.5 text-xs text-foreground/90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
