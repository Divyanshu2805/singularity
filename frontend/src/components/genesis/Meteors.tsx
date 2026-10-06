/**
 * The falling stars behind the landing rebuild's hero (genesis/Hero.tsx), which the owner asked for once the ribbon
 * that stood there was taken out: "asteroids or stars falling in bg".
 *
 * Handles: a slow shower over the first screen - a handful of fine gold streaks, each with a bright head, all
 * falling the same way (down and to the left, as a real shower's do from one radiant), each on a cycle of its own
 * length and from a place of its own, so that one crosses every second or two and the pattern does not visibly
 * repeat. Nearer ones are longer, brighter and quicker; farther ones are short and faint.
 *
 * They are the app's own shooting star (index.css, .shooting-star - the sign-in page's streak) given a longer fall
 * and a steeper line, not a new kind of light. Every streak is one element moved by a CSS animation of transform
 * and opacity alone (genesis.css, .genesis-meteor), so the shower runs on the compositor and costs the page's
 * script nothing; there is no canvas and no timer. The list is fixed, so every load has the same shower. The
 * shower is not started until the opening has landed (play), and under reduced motion it is not shown.
 */
import type { CSSProperties } from "react";

const ANGLE = 128;

const METEORS = [
  { left: 34, top: -4, length: 150, reach: 720, every: 9.5, delay: 0.2, bright: 0.95 },
  { left: 58, top: -6, length: 110, reach: 620, every: 12.5, delay: 1.9, bright: 0.6 },
  { left: 82, top: -5, length: 170, reach: 780, every: 10.5, delay: 3.4, bright: 1 },
  { left: 99, top: 14, length: 120, reach: 640, every: 13.5, delay: 5.1, bright: 0.7 },
  { left: 47, top: -3, length: 90, reach: 520, every: 11.5, delay: 6.6, bright: 0.5 },
  { left: 71, top: -6, length: 140, reach: 700, every: 14.5, delay: 8.2, bright: 0.85 },
  { left: 102, top: 38, length: 100, reach: 560, every: 12, delay: 9.7, bright: 0.55 },
  { left: 22, top: -5, length: 80, reach: 480, every: 15.5, delay: 11.3, bright: 0.45 },
];

export function Meteors({ play }: { play: boolean }) {
  if (!play) return null;

  return (
    <div aria-hidden="true" className="genesis-meteors">
      {METEORS.map((meteor) => (
        <span
          key={meteor.delay}
          className="genesis-meteor"
          style={
            {
              left: `${meteor.left}%`,
              top: `${meteor.top}%`,
              "--angle": `${ANGLE}deg`,
              "--length": `${meteor.length}px`,
              "--reach": `${meteor.reach}px`,
              "--every": `${meteor.every}s`,
              "--delay": `${meteor.delay}s`,
              "--bright": meteor.bright,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
