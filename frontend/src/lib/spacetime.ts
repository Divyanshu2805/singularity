/**
 * A sheet of space-time seen from above: how far a point of it is drawn towards a mass resting on it, how far the
 * rings spreading from a mass push it, and the spring a well opens and closes on.
 *
 * Handles: sinkAt - how far a point is drawn towards a mass that is `out` pixels away: nothing at the mass itself,
 * the most (depth) a third of the way to the well's rim (reach) and nothing again from the rim on, so the sheet
 * gathers round the mass and meets the flat sheet beyond it without a crease; sinkLimit - the deepest a well of a
 * given reach can be before the sheet would fold over itself (points near the mass overtaking the ones beyond them),
 * which a caller holds its depth under; ringAt - the push, outwards when positive, of rings travelling out from a
 * source: a wave `span` pixels from crest to crest whose phase is `turn`, fading with distance (reach) and still at
 * the source itself (calm), so whatever sits there never shakes; and springTowards - one step of a spring carrying a
 * level towards its goal, under-damped so that it overshoots a little and settles, which is what makes a well opening
 * or closing read as cloth being let go rather than as a fade.
 *
 * All of it is plain arithmetic on distances, with no drawing and no DOM: the sheet that uses it
 * (components/auth/SpacetimeFabric.tsx) only has to turn each point's distance into a direction. The step a spring
 * takes is capped (MAX_STEP_MS), so a frame that arrives late - a tab coming back - cannot throw it past its goal.
 */
const PEAK = 6.75;
const MAX_STEP_MS = 34;

export type Spring = { at: number; speed: number };

export function sinkAt(out: number, depth: number, reach: number) {
  if (out <= 0 || out >= reach) return 0;
  const along = out / reach;
  return depth * PEAK * along * (1 - along) * (1 - along);
}

export function sinkLimit(reach: number) {
  return reach / PEAK;
}

export function ringAt(out: number, size: number, span: number, reach: number, calm: number, turn: number) {
  if (out <= 0) return 0;
  return size * Math.exp(-out / reach) * ((out * out) / (out * out + calm * calm)) * Math.sin((out / span) * Math.PI * 2 - turn);
}

export function springTowards(spring: Spring, goal: number, elapsedMs: number, periodMs: number, damping: number) {
  const step = Math.min(elapsedMs, MAX_STEP_MS) / 1000;
  const pace = (Math.PI * 2 * 1000) / periodMs;
  spring.speed += (pace * pace * (goal - spring.at) - 2 * damping * pace * spring.speed) * step;
  spring.at += spring.speed * step;
}
