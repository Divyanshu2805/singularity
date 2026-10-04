/**
 * The new landing page's security section: where a project's code runs, shown as an orrery, and the three guarantees
 * that follow from it.
 *
 * Handles: the heading (Heading); the orrery (cosmos/orrery.ts) on a canvas that redraws every frame while it is on
 * screen - its bodies keep turning on the clock, and its comets move with the scroll, so the visitor drives the four
 * moves a request makes (your prompt to the AI, the files it writes into storage, the files synced into the sealed
 * preview pod, and the live preview coming back) and can run them backwards; beside it the same four moves in words,
 * as a list whose current line lights as its comet flies (the sign-in switch's gold chip, with the line's number
 * lighting gold); and as the section leaves the screen upwards the orrery's orbits widen, flatten and fade, handing
 * on to the orbits behind the plans. Under them, three cards in the sign-in card's material carry the guarantees -
 * code never runs on our servers, sign-in with a second factor, limits enforced by the server - each icon making one
 * small move the first time its card is seen (the lock closing, the key turning, the gauge's needle sweeping).
 *
 * Progress through the orrery runs from when its top is near the bottom of the screen to when it is near the top
 * (TRAVEL_FROM, TRAVEL_SHARE), so every move happens while the orrery is in view. Scroll values reach the canvas
 * through refs, so a scroll re-renders only the list, and only when its current line changes. Under reduced motion
 * the orrery is drawn once with every move made, and the cards are simply there.
 */
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { Gauge, KeyRound, Lock, type LucideIcon } from "lucide-react";
import { useInView, usePrefersReducedMotion } from "@/components/landing/motion";
import { drawOrrery, orreryStep } from "@/components/cosmos/orrery";
import { clamp01, useScrollScene } from "@/lib/scroll-scene";
import { cn } from "@/lib/utils";
import { Heading } from "./Heading";

const TRAVEL_FROM = 0.92;
const TRAVEL_SHARE = 0.72;

const MOVES = [
  { title: "Your prompt goes to the AI", body: "You describe the change in your browser, in plain words." },
  { title: "The AI writes files — and runs nothing", body: "Each file it writes is kept in your project's storage." },
  { title: "The files sync into a sealed pod", body: "A pod of its own on Kubernetes, shut down when it sits idle." },
  { title: "The pod serves your live preview", body: "The only place your project's code ever runs." },
];

const GUARANTEES: { icon: LucideIcon; motion: string; title: string; body: string }[] = [
  {
    icon: Lock,
    motion: "lock",
    title: "Generated code never runs on our servers",
    body: "It runs only inside a throwaway pod of its own, which is shut down after it sits idle.",
  },
  {
    icon: KeyRound,
    motion: "key",
    title: "Sign in your way, with a second factor",
    body: "Google, or email and a password — and add two-factor authentication whenever you like.",
  },
  {
    icon: Gauge,
    motion: "gauge",
    title: "Limits that are actually limits",
    body: "Daily token and project allowances are enforced by the server, so a plan's numbers are the plan's numbers.",
  },
];

function OrreryCanvas({ progress, stretch }: { progress: MutableRefObject<number>; stretch: MutableRefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let onScreen = true;
    const started = performance.now();

    const resize = () => {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    };
    const paint = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      drawOrrery(context, width, height, reduced ? 1 : progress.current, reduced ? 6 : (performance.now() - started) / 1000 + 6, reduced ? 0 : stretch.current);
    };
    const loop = () => {
      paint();
      frame = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced || document.hidden || !onScreen) return;
      running = true;
      frame = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };

    resize();
    paint();
    start();
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(canvas);
    const layout = new ResizeObserver(() => {
      resize();
      paint();
    });
    layout.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      layout.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [progress, stretch, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />;
}

function Guarantee({ guarantee, index }: { guarantee: (typeof GUARANTEES)[number]; index: number }) {
  const [ref, shown] = useInView<HTMLDivElement>({ threshold: 0.5 });
  const Icon = guarantee.icon;

  return (
    <div ref={ref} data-shown={shown} className="ln-guard auth-panel relative p-6" style={{ "--i": index } as CSSProperties}>
      <span className={cn("ln-guard-icon tile-icon", `ln-guard-${guarantee.motion}`)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="mt-4 font-display text-[19px] font-semibold leading-snug tracking-tight text-foreground">{guarantee.title}</h3>
      <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">{guarantee.body}</p>
    </div>
  );
}

export function Security() {
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const stretch = useRef(0);
  const reduced = usePrefersReducedMotion();
  const [current, setCurrent] = useState(reduced ? MOVES.length - 1 : -1);
  const shown = useRef(current);

  useScrollScene(stageRef, (frame) => {
    if (reduced) return;
    progress.current = clamp01((frame.viewport * TRAVEL_FROM - frame.top) / (frame.viewport * TRAVEL_SHARE));
    stretch.current = clamp01((frame.viewport * 0.12 - frame.top) / (frame.height * 0.9));
    const next = orreryStep(progress.current);
    if (next !== shown.current) {
      shown.current = next;
      setCurrent(next);
    }
  });

  return (
    <section id="security" aria-labelledby="security-title" className="landing-wrap relative scroll-mt-20 py-24 sm:py-32">
      <Heading id="security-title" eyebrow="Security" title="In a sandbox, never on our" accent="machines." />
      <div ref={stageRef} className="mx-auto mt-12 grid max-w-[82rem] items-center gap-8 sm:mt-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        <div className="relative h-[340px] sm:h-[440px] lg:h-[480px]">
          <OrreryCanvas progress={progress} stretch={stretch} />
        </div>
        <ol className="ln-moves flex flex-col gap-1.5" aria-label="What happens to a request">
          {MOVES.map((move, index) => (
            <li key={move.title} data-state={index < current ? "done" : index === current ? "active" : "next"} className="ln-move rounded-2xl px-4 py-3.5">
              <p className="flex items-baseline gap-3 text-[16px] font-semibold tracking-[-0.012em]">
                <span className="ln-move-number">{String(index + 1).padStart(2, "0")}</span>
                {move.title}
              </p>
              <p className="mt-1 pl-[2.1rem] text-[14px] leading-[1.55] text-muted-foreground">{move.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="mx-auto mt-14 grid max-w-[82rem] gap-5 md:grid-cols-3">
        {GUARANTEES.map((guarantee, index) => (
          <Guarantee key={guarantee.title} guarantee={guarantee} index={index} />
        ))}
      </div>
    </section>
  );
}
