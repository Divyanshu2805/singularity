/**
 * The whole-page loading state: the app's plain night, and the horizon mark building itself in the middle of it.
 *
 * Handles: the mark drawing itself in its breathing glow inside a slow orbiting comet ring, and a shimmering mono label over a
 * thin sweeping bar, announced as a status.
 *
 * The mark and label only fade up after a short pause (index.css, .app-loading), so a page that arrives quickly -
 * most of them, once their code is cached - shows nothing but the night for its moment instead of flashing a loader. It stood on the moving starfield until that
 * was taken out of the signed-in app.
 */
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { HorizonMark } from "@/components/HorizonMark";
import { cn } from "@/lib/utils";

export function AppLoading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("relative flex min-h-screen items-center justify-center overflow-hidden bg-background", className)}>
      <div role="status" aria-label={label} className="app-loading relative flex flex-col items-center gap-7">
        <span className="relative inline-flex h-28 w-28 items-center justify-center">
          <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[40%] rounded-full" />
          <OrbitSpinner className="absolute inset-0 h-full w-full" />
          <HorizonMark drawn className="relative h-12 w-12" />
        </span>
        <span className="flex flex-col items-center gap-3">
          <span aria-hidden="true" className="text-shimmer font-mono text-[11px] uppercase tracking-[0.3em]">
            {label}
          </span>
          <span aria-hidden="true" className="app-loading-bar relative block h-px w-36 overflow-hidden rounded-full bg-white/[0.08]" />
        </span>
      </div>
    </div>
  );
}
