/**
 * How it works, laid flat: the five steps as a list of cards beside a window that plays each one on the app's own
 * screens (above them on a narrow screen).
 *
 * Handles: the list and the window; a clock that plays the steps one after another on a loop while the window is on
 * screen and stops when it is not; lighting the step being played, with a ring filling round its badge and a bar
 * filling along the window's top edge as it goes, and ticking the steps already played; and letting the visitor pick
 * a step, which starts it from its beginning. Every piece rises into place with the scroll (scroll-rise.ts), as the
 * plans' cards do.
 *
 * This is what a screen too narrow for the orbit gets, and anyone who has asked for reduced motion (StepOrbit is the
 * other telling, and how-steps.ts the list both read). It was the whole section for a while, when the home page was
 * first laid out on the star sky alone.
 *
 * Per-frame values are kept out of React: the film's time goes through a small ticker only the window's scene
 * subscribes to, and how far through the step the clock is goes to the --step custom property the ring and the bar
 * read (index.css, .orbit-progress and .orbit-bar), so the list re-renders only when the step or the film changes.
 * Under reduced motion nothing plays: the window holds the running app, and picking a step shows that step finished.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BuildScene } from "./BuildScenes";
import { Lift } from "./Lift";
import { SPANS, STEPS, firstScene, lastScene, type Step } from "./how-steps";
import { useInView, usePrefersReducedMotion } from "./motion";
import { useScrollRise } from "./scroll-rise";

const STARTS = SPANS.map((_, index) => SPANS.slice(0, index).reduce((sum, span) => sum + span, 0));
const CYCLE = SPANS.reduce((sum, span) => sum + span, 0);
const STILL_STEP = 3;
const STILL_TIME = 60000;
const FRAME_CAP_MS = 100;
const TICK_MS = 40;

type Position = { step: number; scene: number; fraction: number; time: number };

function locate(elapsed: number): Position {
  let rest = elapsed % CYCLE;
  for (let step = 0; step < STEPS.length; step++) {
    if (rest < SPANS[step]) {
      let time = rest;
      for (const film of STEPS[step].films) {
        if (time < film.duration) return { step, scene: film.scene, fraction: rest / SPANS[step], time };
        time -= film.duration;
      }
    }
    rest -= SPANS[step];
  }
  return { step: 0, scene: firstScene(0), fraction: 0, time: 0 };
}

function createTicker() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: number) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type Ticker = ReturnType<typeof createTicker>;

function SceneRunner({ scene, ticker }: { scene: number; ticker: Ticker }) {
  const time = useSyncExternalStore(ticker.subscribe, ticker.get);
  return <BuildScene index={scene} t={time} />;
}

function Badge({ step, active, done }: { step: Step; active: boolean; done: boolean }) {
  const Icon = step.icon;
  return (
    <span
      className={cn(
        "orbit-badge relative grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors duration-500",
        active ? "border-primary/70 bg-primary/15 text-primary" : done ? "border-[hsl(151_52.1%_56%/0.5)] text-[hsl(151_52.1%_56%)]" : "border-white/10 text-muted-foreground"
      )}
    >
      {done && !active ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      {active && (
        <svg aria-hidden="true" viewBox="0 0 40 40" className="absolute -inset-[5px] h-[38px] w-[38px] -rotate-90">
          <circle cx="20" cy="20" r="18" pathLength={100} className="orbit-progress" />
        </svg>
      )}
    </span>
  );
}

export function StepList() {
  const reduced = usePrefersReducedMotion();
  const stage = useScrollRise<HTMLDivElement>();
  const [windowRef, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0.25, rootMargin: "0px" });
  const [ticker] = useState(createTicker);
  const [shown, setShown] = useState({ step: 0, scene: firstScene(0) });
  const elapsed = useRef(0);
  const last = useRef(shown);

  const show = useCallback((step: number, scene: number) => {
    if (last.current.step === step && last.current.scene === scene) return;
    last.current = { step, scene };
    setShown(last.current);
  }, []);

  useEffect(() => {
    const root = stage.current;
    if (reduced) {
      ticker.set(STILL_TIME);
      root?.style.setProperty("--step", "1");
      show(STILL_STEP, lastScene(STILL_STEP));
      return;
    }
    if (!visible) return;
    let frame = 0;
    let then = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      elapsed.current += then ? Math.min(FRAME_CAP_MS, now - then) : 0;
      then = now;
      const at = locate(elapsed.current);
      show(at.step, at.scene);
      ticker.set(Math.round(at.time / TICK_MS) * TICK_MS);
      root?.style.setProperty("--step", at.fraction.toFixed(3));
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reduced, visible, ticker, stage, show]);

  const pick = (step: number) => {
    if (reduced) {
      show(step, lastScene(step));
      return;
    }
    elapsed.current = STARTS[step];
    ticker.set(0);
    stage.current?.style.setProperty("--step", "0");
    show(step, firstScene(step));
  };

  const current = STEPS[shown.step];

  return (
    <div ref={stage} className="mx-auto mt-14 grid max-w-[82.5rem] items-center gap-8 sm:mt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
      <div className="space-y-3">
        {STEPS.map((step, index) => {
          const active = index === shown.step;
          const done = !reduced && index < shown.step;
          return (
            <Lift key={step.label}>
              <div className="orbit-node" data-active={active} data-done={done && !active}>
                <button type="button" onClick={() => pick(index)} aria-current={active ? "step" : undefined} className="home-step block w-full text-left">
                  <span className="orbit-card relative flex items-center gap-4 overflow-hidden rounded-[18px] border px-4 py-3.5 sm:px-5 sm:py-4">
                    <Badge step={step} active={active} done={done} />
                    <span className="relative min-w-0 flex-1">
                      <span className="flex items-center font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/80">
                        {step.label}
                        <span className="ml-auto tabular-nums tracking-[0.12em] text-muted-foreground/70">
                          <span className="text-primary/90">0{index + 1}</span> / 0{STEPS.length}
                        </span>
                      </span>
                      <span className="mt-1.5 block font-display text-[19px] font-semibold leading-tight tracking-tight">{step.title}</span>
                      <span className="orbit-detail mt-1 block text-[13px] leading-[1.5]">{step.detail}</span>
                    </span>
                  </span>
                </button>
              </div>
            </Lift>
          );
        })}
      </div>

      <Lift className="order-first lg:order-none">
        <div
          ref={windowRef}
          className="relative flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 font-mono shadow-[0_40px_90px_-30px_rgb(0_0_0/0.85),0_0_0_1px_hsl(var(--primary)/0.06)]"
        >
          <div className="flex items-center gap-3 border-b border-border/70 bg-panel/80 px-3.5 py-2.5">
            <div className="terminal-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="truncate text-[11px] text-muted-foreground">running-club — Singularity</span>
            <span key={shown.step} className="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary animate-in fade-in zoom-in-95 duration-300">
              0{shown.step + 1} · {current.label}
            </span>
          </div>
          <span className="relative block h-[2px] bg-border/50">
            <span className="orbit-bar absolute inset-0 origin-left bg-primary" />
          </span>
          <div className="relative aspect-[5/3] w-full">
            <div key={shown.scene} className="absolute inset-0 animate-in fade-in duration-300">
              <SceneRunner scene={shown.scene} ticker={ticker} />
            </div>
          </div>
        </div>
      </Lift>
    </div>
  );
}
