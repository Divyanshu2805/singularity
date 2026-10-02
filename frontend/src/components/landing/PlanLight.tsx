/**
 * The light inside a lit card: the recommended plan's on the landing page, and the sign-in card, which the owner asked
 * to be given the same look.
 *
 * Handles: the layers that sit behind such a card's content, clipped to its rounding - the light pooled along the
 * bottom edge and climbing a little way up both sides (.plan-rise, .plan-sides), the rippling grid with its lit cells
 * (PlanFabric), a few stars that fade in and out where the card is dark and drift a few pixels against the pointer
 * (STARS: left and top in percent, size in pixels, peak opacity, delay and period in seconds), and now and then a
 * shooting star across the top (.plan-comet).
 *
 * Everything waits for the card to have arrived: the light rises, the stars come up and the cells start their beats
 * only under an ancestor marked data-landed="true", which is the card's own business to set, and PlanFabric is told
 * the same thing directly (landed) since it draws on a canvas. The card it sits in must be a .plan-card - that is the
 * element PlanFabric listens to for the pointer.
 */
import type { CSSProperties } from "react";
import { PlanFabric } from "./PlanFabric";

const STARS = [
  [9, 7, 1.5, 0.75, 0, 6],
  [22, 16, 1, 0.5, 1.4, 7.5],
  [38, 5, 1, 0.45, 3.1, 5.5],
  [52, 12, 2, 0.85, 0.7, 8],
  [64, 4, 1, 0.5, 2.2, 6.5],
  [73, 19, 1.5, 0.65, 4, 7],
  [84, 9, 1, 0.55, 1.1, 9],
  [92, 24, 2, 0.8, 2.9, 6],
  [88, 38, 1, 0.4, 0.3, 7.5],
  [57, 30, 1, 0.4, 3.6, 8.5],
  [95, 52, 1.5, 0.5, 1.9, 6.5],
];

export function PlanLight({ landed }: { landed: boolean }) {
  return (
    <span aria-hidden="true" className="plan-lit">
      <span className="plan-rise" />
      <span className="plan-sides" />
      <PlanFabric landed={landed} />
      <span className="plan-stars">
        {STARS.map(([left, top, size, peak, delay, period]) => (
          <span
            key={`${left}-${top}`}
            className="plan-star"
            style={{ left: `${left}%`, top: `${top}%`, "--s": `${size}px`, "--peak": peak, "--d": `${delay}s`, "--t": `${period}s` } as CSSProperties}
          />
        ))}
      </span>
      <span className="plan-comet" />
    </span>
  );
}
