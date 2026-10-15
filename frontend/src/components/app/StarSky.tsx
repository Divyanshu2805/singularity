/**
 * The sky behind the app's whole-page states: a sparse scatter of stars and four-point sparks over the night.
 *
 * Handles: the stars, each fading in and out on its own clock while a third of them (anchors) only twinkle, so the sky
 * is never empty and never pulses as one; kept to the edges, away from the middle where the mark and the words stand.
 * The ember light that rises behind a mark (index.css, .sky-halo) is the page's own, since it has to sit on the mark.
 *
 * It is CSS alone (index.css, .sky-star) - no canvas, no timers - so the error page can use it when the
 * rest of the page could not render, and the loading page can show it without costing a frame. Under reduced motion
 * the stars hold still. It began as the error page's own sky and moved here when the loading, 404 and unavailable
 * pages were given the same one, so that every wrong turn and every wait looks like the same place.
 */
import type { CSSProperties } from "react";

type Star = [x: number, y: number, size: number, peak: number, life: number, delay: number, kind?: "anchor" | "spark"];

const STARS: Star[] = [
  [5, 14, 2, 0.75, 11, -3, "anchor"],
  [12, 31, 1.5, 0.6, 9, -7],
  [4, 47, 1.5, 0.5, 13, -1],
  [17, 9, 1.5, 0.55, 10, -5],
  [22, 58, 2, 0.65, 12, -9, "anchor"],
  [9, 72, 1.5, 0.6, 9, -4],
  [26, 86, 1.5, 0.5, 11, -8],
  [15, 93, 2, 0.6, 14, -2],
  [28, 24, 1, 0.5, 8, -6],
  [19, 41, 7, 0.7, 12, -5, "spark"],
  [94, 10, 2, 0.7, 12, -6, "anchor"],
  [83, 22, 1.5, 0.55, 10, -2],
  [91, 37, 1.5, 0.6, 9, -8],
  [76, 50, 1, 0.45, 11, -3],
  [96, 61, 2, 0.65, 13, -10],
  [86, 77, 1.5, 0.6, 9, -1, "anchor"],
  [73, 90, 1.5, 0.5, 12, -7],
  [92, 92, 1, 0.5, 10, -4],
  [80, 8, 1, 0.45, 9, -9],
  [84, 63, 8, 0.65, 14, -9, "spark"],
  [38, 6, 1.5, 0.5, 10, -4, "anchor"],
  [61, 4, 1, 0.45, 12, -8],
  [44, 95, 1.5, 0.5, 11, -6],
  [58, 91, 1, 0.45, 9, -2],
  [67, 13, 6, 0.55, 13, -4, "spark"],
];

export function StarSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {STARS.map(([x, y, size, peak, life, delay, kind]) => (
        <span
          key={`${x}-${y}`}
          data-kind={kind}
          className="sky-star"
          style={
            {
              left: `${x}%`,
              top: `${y}%`,
              "--s": `${size}px`,
              "--o": peak,
              animationDuration: `${life}s`,
              animationDelay: `${delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
