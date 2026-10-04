/**
 * The canvas a step's celestial instrument (instruments.ts) is drawn on.
 *
 * Handles: sizing the canvas to its box at the screen's density (up to two device pixels per CSS pixel - the
 * instruments are fine lines and small type), drawing the current step's instrument every frame from a progress the
 * caller keeps in a ref (so a scroll never re-renders anything to move it), running only while the canvas is on
 * screen and the tab is visible, fading the new instrument in when the step changes, and under reduced motion drawing
 * each step once, finished.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";
import { INSTRUMENTS } from "./instruments";

export function InstrumentCanvas({ step, progress, className }: { step: number; progress: MutableRefObject<number>; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const first = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || first.current || reduced || typeof canvas.animate !== "function") {
      first.current = false;
      return;
    }
    canvas.animate([{ opacity: 0, filter: "blur(3px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [step, reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const draw = INSTRUMENTS[step];
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
    const paint = (time: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      draw(context, width, height, reduced ? 1 : progress.current, time);
    };
    const loop = () => {
      paint((performance.now() - started) / 1000);
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
    paint(0);
    start();
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(canvas);
    const layout = new ResizeObserver(() => {
      resize();
      paint((performance.now() - started) / 1000);
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
  }, [step, progress, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("block h-full w-full", className)} />;
}
