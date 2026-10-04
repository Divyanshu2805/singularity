/**
 * The app's window in the new landing page's journey: the real app's screens (BuildScenes, built from AppReplica in
 * the app's own classes), playing whichever moment the page is at.
 *
 * Handles: the window's frame in the app's material - a bar with the three window dots, the project's name and a chip
 * naming the step that is playing (it swaps in as the step changes), and a hairline under the bar filling with the
 * journey's progress (the caller writes its scale through barRef, from the scroll, with no re-render) - and the
 * screen under it, read from the ticker (story.ts) so only the screen re-renders as the moment moves, and only when it
 * actually moves. Each new screen fades in rather than cutting. The screens either side of the one playing are built
 * ahead, while the browser is idle, and kept hidden at their first moment (memoised, so the moving one never
 * re-renders them): building one of the app's screens on the spot cost a frame of about 90ms, a visible hitch at every
 * change of step.
 *
 * The window is a picture of the app, not a part of the page to use: it is hidden from assistive technology, and the
 * steps beside it say in words what it shows. It is laid out once at its largest size and moved and scaled by its caller (Journey), so the screen inside
 * keeps one layout for the whole journey; BuildScenes' camera works from the window's laid-out width.
 */
import { forwardRef, memo, useEffect, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { BuildScene } from "@/components/landing/BuildScenes";
import { cn } from "@/lib/utils";
import { LAST_SCENE, STORY, type Ticker } from "./story";

const SceneAt = memo(function SceneAt({ index, t }: { index: number; t: number }) {
  return <BuildScene index={index} t={t} />;
});

function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 300);
  return () => window.clearTimeout(id);
}

function SceneRunner({ ticker }: { ticker: Ticker }) {
  const moment = useSyncExternalStore(ticker.subscribe, ticker.get);
  const [kept, setKept] = useState<number[]>([]);

  useEffect(() => whenIdle(() => setKept([moment.scene - 1, moment.scene + 1].filter((index) => index >= 0 && index <= LAST_SCENE))), [moment.scene]);

  const mounted = Array.from(new Set([...kept, moment.scene])).sort((a, b) => a - b);
  return (
    <>
      {mounted.map((index) => {
        const current = index === moment.scene;
        return (
          <div key={index} data-current={current} className="ln-scene absolute inset-0">
            <SceneAt index={index} t={current ? moment.t : 0} />
          </div>
        );
      })}
    </>
  );
}

function StepChip({ ticker }: { ticker: Ticker }) {
  const moment = useSyncExternalStore(ticker.subscribe, ticker.get);
  return (
    <span key={moment.step} className="ln-window-chip auth-swap ml-auto shrink-0" data-swap>
      {String(moment.step + 1).padStart(2, "0")} · {STORY[moment.step].name}
    </span>
  );
}

export const StepWindow = forwardRef<HTMLDivElement, { ticker: Ticker; barRef?: RefObject<HTMLSpanElement>; style?: CSSProperties; className?: string }>(
  function StepWindow({ ticker, barRef, style, className }, ref) {
    return (
      <div ref={ref} aria-hidden="true" style={style} className={cn("ln-window flex flex-col overflow-hidden", className)}>
        <div className="ln-window-bar flex items-center gap-3 px-4 py-2.5">
          <div className="terminal-dots">
            <span />
            <span />
            <span />
          </div>
          <span className="truncate text-[12px] text-muted-foreground">running-club — Singularity</span>
          <StepChip ticker={ticker} />
        </div>
        <span className="relative block h-px bg-white/[0.06]">
          <span ref={barRef} className="ln-window-progress absolute inset-0 origin-left" />
        </span>
        <div className="relative min-h-0 flex-1">
          <SceneRunner ticker={ticker} />
        </div>
      </div>
    );
  }
);
