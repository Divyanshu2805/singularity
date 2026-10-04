/**
 * A canvas that plays one of the feature cards' celestial scenes (feature-scenes.ts) on its own clock.
 *
 * Handles: sizing the canvas to its box at up to two device pixels per CSS pixel, running the scene's clock and
 * redrawing about 30 times a second (FRAME_MS - the scenes move slowly, and six of them share a screen) only while
 * the canvas is on screen and the tab is visible (the clock carries on from where
 * it stopped), following the pointer across the card the canvas sits in (the nearest [data-feature] ancestor, or the
 * canvas itself) and easing how far "over" it the pointer is between 0 and 1 so a scene can warm up under it rather
 * than snap, and under reduced motion drawing one frame at the scene's resting moment (still) and holding it.
 */
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";
import type { FeatureScene, Pointer } from "./feature-scenes";

const WARM_MS = 260;
const FRAME_MS = 31;

export function LoopCanvas({ scene, still = 4, className }: { scene: FeatureScene; still?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const host = canvas.closest<HTMLElement>("[data-feature]") ?? canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pointer: Pointer = { x: 0, y: 0, over: 0 };
    let inside = false;
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let onScreen = true;
    let clock = still;
    let last = 0;
    let paintedAt = Number.NEGATIVE_INFINITY;

    const resize = () => {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    };
    const paint = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      scene(context, width, height, clock, pointer);
    };
    const loop = (now: number) => {
      const elapsed = last ? Math.min(64, now - last) : 16;
      last = now;
      clock += elapsed / 1000;
      pointer.over += ((inside ? 1 : 0) - pointer.over) * (1 - Math.exp(-elapsed / WARM_MS));
      if (now - paintedAt >= FRAME_MS) {
        paintedAt = now;
        paint();
      }
      frame = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced || document.hidden || !onScreen) return;
      running = true;
      last = 0;
      frame = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      inside = event.pointerType === "mouse";
    };
    const onLeave = () => {
      inside = false;
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
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      stop();
      observer.disconnect();
      layout.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [scene, still, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("block h-full w-full", className)} />;
}
