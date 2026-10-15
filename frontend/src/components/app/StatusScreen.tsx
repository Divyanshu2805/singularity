/**
 * The whole-page state that says something: a page that is not there, a page that could not be opened, a connection that
 * is being made - one stage for all of them, so that a wrong turn looks like the same place as everything else.
 *
 * Handles: the night's star sky (StarSky), the horizon mark building itself in its glow over an ember light that comes
 * up with it, a mono eyebrow, a Fraunces heading whose closing words are set in the sweeping gold, the sentence that
 * explains and the way forward, each rising in turn after a short pause. `busy` says to a screen reader that the page is
 * waiting, for a wait that is not a failure; `alert` announces the page as an alert, for one that is. Neither puts
 * anything round the mark - the owner asked for the black hole alone, without an orbit circling it; `drawn` and `onMarkEnter` let a page replay the mark's build (the
 * error page does on hover); `footer` is whatever sits quietly under the actions.
 *
 * The pages that had their own copy of this - the 404, the error page, a shared app that is not there, GitHub's
 * return - differed by a font size and a delay each. Under reduced motion nothing rises, the mark appears built and
 * the sky holds still (index.css).
 */
import type { CSSProperties, ReactNode } from "react";
import { HorizonMark } from "@/components/HorizonMark";
import { StarSky } from "@/components/app/StarSky";

export interface StatusScreenProps {
  eyebrow: string;
  title: string;
  accent: string;
  children?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  alert?: boolean;
  drawn?: boolean;
  onMarkEnter?: () => void;
}

const rise = (i: number) => ({ "--i": i, "--rise-delay": "200ms" }) as CSSProperties;

export function StatusScreen({ eyebrow, title, accent, children, actions, footer, busy, alert, drawn = true, onMarkEnter }: StatusScreenProps) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center">
      <StarSky />

      <div className="relative flex w-full max-w-xl flex-col items-center">
        <span className="error-mark relative mb-9 inline-flex h-16 w-16" onMouseEnter={onMarkEnter}>
          <span
            aria-hidden="true"
            className="sky-halo pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[44rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
          <span
            aria-hidden="true"
            className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full"
          />
          <HorizonMark className="relative h-full w-full" drawn={drawn} />
        </span>

        <div role={alert ? "alert" : busy ? "status" : undefined} className="flex flex-col items-center">
          <p className="app-eyebrow app-fade" style={rise(1)}>
            {eyebrow}
          </p>
          <h1
            className="landing-heading app-rise mt-4 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[44px]"
            style={rise(2)}
          >
            {title} <em className="heat-text animate-heat-sweep pr-1 font-medium motion-reduce:animate-none">{accent}</em>
          </h1>
          {children && (
            <p className="app-rise mt-4 max-w-sm text-[14.5px] leading-relaxed text-muted-foreground" style={rise(3)}>
              {children}
            </p>
          )}
        </div>

        {actions && (
          <div className="app-rise mt-8 flex flex-wrap items-center justify-center gap-3" style={rise(4)}>
            {actions}
          </div>
        )}

        {footer && (
          <div className="app-fade mt-10 flex w-full max-w-md flex-col items-center" style={rise(7)}>
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
