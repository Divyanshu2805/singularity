/**
 * The Code Lens card's scene: a lens gliding over a file of the project's own code and settling on a line, while
 * ExplainLLM's answer about that line streams in beside it.
 *
 * Handles: the code (the streak counter the build in how-it-works writes, highlighted as the app's editor highlights
 * it, CodeText), a round lens that magnifies what is under it - a second copy of the code, scaled about the lens's
 * centre and cut to its circle, under a fine ring of light like an Einstein ring - and moves on a loop (CYCLE_MS):
 * it glides to the line with the Set on it, holds there while the question and its answer are typed out, then drifts
 * off and the answer clears; under a mouse it follows the pointer instead, trailing it by a breath (FOLLOW_MS). All of
 * it is written straight onto the elements from one animation frame loop that runs only while the card is on screen
 * and the tab is visible, so nothing re-renders as it moves. Under reduced motion the lens rests on the Set's line
 * with the answer shown in full.
 *
 * The answer is the one BuildScenes' ExplainLLM scene gives about the same line, so the page never promises a
 * different explanation in two places.
 */
import { useEffect, useRef } from "react";
import { CodeText } from "@/components/landing/AppReplica";
import { usePrefersReducedMotion } from "@/components/landing/motion";

const CODE = [
  "// Count how many days in a row a runner has logged a run.",
  "export function currentStreak(runs: Run[]) {",
  "  const days = new Set(runs.map(dayKey));",
  "  let day = today();",
  "  let streak = 0;",
  "  while (days.has(dayKey(day))) {",
  "    streak += 1;",
  "    day = previousDay(day);",
  "  }",
  "  return streak;",
  "}",
];
const QUESTION = "Why is this a Set?";
const ANSWER =
  "A Set keeps each day once and answers “did they run that day?” in one step, so counting back from today is a quick check per day - not a search through every run.";

const LINE = 20;
const LENS = 92;
const ZOOM = 1.6;
const CYCLE_MS = 11000;
const FOLLOW_MS = 160;
const TARGET = { x: 192, y: 2 * LINE + LINE / 2 + 10 };
const AWAY = { x: 220, y: 6 * LINE + 10 };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function Code() {
  return (
    <pre className="ln-lens-code m-0 px-4 py-2.5 font-mono text-[12px] leading-[20px]">
      {CODE.map((line, index) => (
        <div key={index} className="flex whitespace-pre">
          <span className="mr-4 inline-block w-4 select-none text-right text-muted-foreground/50">{index + 1}</span>
          <CodeText text={line} />
        </div>
      ))}
    </pre>
  );
}

export function LensCode() {
  const boxRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLSpanElement>(null);
  const answerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const box = boxRef.current;
    const lens = lensRef.current;
    const zoom = zoomRef.current;
    const ask = askRef.current;
    const answer = answerRef.current;
    const bubble = bubbleRef.current;
    if (!box || !lens || !zoom || !ask || !answer || !bubble) return;
    const host = box.closest<HTMLElement>("[data-feature]") ?? box;
    const at = { x: TARGET.x, y: TARGET.y };
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let running = false;
    let onScreen = true;
    let clock = 0;
    let last = 0;

    const place = (x: number, y: number) => {
      lens.style.transform = `translate3d(${(x - LENS / 2).toFixed(1)}px, ${(y - LENS / 2).toFixed(1)}px, 0)`;
      zoom.style.transform = `translate3d(${(LENS / 2 - x * ZOOM).toFixed(1)}px, ${(LENS / 2 - y * ZOOM).toFixed(1)}px, 0) scale(${ZOOM})`;
    };
    const write = (t: number) => {
      const typing = clamp01((t - 0.2) / 0.08);
      const streaming = clamp01((t - 0.3) / 0.36);
      const clear = clamp01((t - 0.78) / 0.06);
      ask.textContent = QUESTION.slice(0, Math.floor(QUESTION.length * typing));
      answer.textContent = ANSWER.split(" ").slice(0, Math.ceil(ANSWER.split(" ").length * streaming)).join(" ");
      bubble.style.opacity = String(Math.min(clamp01((t - 0.16) / 0.04), 1 - clear));
    };
    const goal = (t: number) => {
      if (t < 0.16) {
        const k = ease(t / 0.16);
        return { x: AWAY.x + (TARGET.x - AWAY.x) * k, y: AWAY.y + (TARGET.y - AWAY.y) * k };
      }
      if (t < 0.78) return { x: TARGET.x + Math.sin(t * 20) * 3, y: TARGET.y + Math.cos(t * 16) * 1.5 };
      const k = ease(clamp01((t - 0.78) / 0.2));
      return { x: TARGET.x + (AWAY.x - TARGET.x) * k, y: TARGET.y + (AWAY.y - TARGET.y) * k };
    };
    const tick = (now: number) => {
      const elapsed = last ? Math.min(64, now - last) : 16;
      last = now;
      clock = (clock + elapsed) % CYCLE_MS;
      const t = clock / CYCLE_MS;
      const target = pointer ?? goal(t);
      const carry = Math.exp(-elapsed / FOLLOW_MS);
      at.x = target.x + (at.x - target.x) * (pointer ? carry : 0);
      at.y = target.y + (at.y - target.y) * (pointer ? carry : 0);
      place(at.x, at.y);
      write(t);
      frame = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || reduced || document.hidden || !onScreen) return;
      running = true;
      last = 0;
      frame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = box.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointer = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? { x, y } : null;
    };
    const onLeave = () => {
      pointer = null;
    };

    place(TARGET.x, TARGET.y);
    write(reduced ? 0.7 : 0);
    start();
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(box);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <div ref={boxRef} aria-hidden="true" className="relative h-full overflow-hidden">
      <Code />
      <div ref={lensRef} className="ln-lens absolute left-0 top-0 overflow-hidden rounded-full" style={{ width: LENS, height: LENS }}>
        <div ref={zoomRef} className="ln-lens-zoom absolute left-0 top-0 origin-top-left">
          <Code />
        </div>
        <span className="ln-lens-ring pointer-events-none absolute inset-0 rounded-full" />
      </div>
      <div ref={bubbleRef} className="ln-lens-answer absolute bottom-3 right-3 w-[min(17rem,52%)] rounded-2xl p-3 opacity-0">
        <p className="text-[12px] font-medium text-foreground">
          <span ref={askRef} />
        </p>
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          <span ref={answerRef} />
        </p>
      </div>
    </div>
  );
}
