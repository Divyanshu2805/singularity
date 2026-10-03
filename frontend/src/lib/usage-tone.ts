/**
 * The colour of the chat usage meter at a given point of its orbit.
 *
 * Handles: usageTone - the tone for a share of the day's allowance, read off a ramp that runs from a pale gold when
 * nothing has been spent, through gold and amber, to a crimson ember when it is all gone, so that the meter's planet
 * and the trail behind it say how much is left by colour as well as by position; and USAGE_TRAIL - the same ramp laid
 * round a full circle as a CSS conic gradient, which the trail shows as much of as the planet has travelled.
 *
 * Both come from one list of stops (share of the allowance, then hue, saturation and lightness), so the planet is
 * always the colour of the trail where it stands. The tone turns red late on purpose - three quarters of the orbit is
 * gold and amber - since the red is the warning and should not be on screen through an ordinary day.
 */
const STOPS = [
  [0, 50, 100, 82],
  [45, 42, 100, 64],
  [75, 26, 98, 56],
  [100, 4, 92, 56],
];

const round = (value: number) => Math.round(value * 10) / 10;

export function usageTone(percent: number) {
  const at = Math.min(100, Math.max(0, percent));
  const next = Math.max(1, STOPS.findIndex(([share]) => share >= at));
  const [fromShare, ...from] = STOPS[next - 1];
  const [toShare, ...to] = STOPS[next];
  const along = (at - fromShare) / (toShare - fromShare);
  const [hue, saturation, lightness] = from.map((value, index) => round(value + (to[index] - value) * along));
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export const USAGE_TRAIL = `conic-gradient(from 0deg, ${STOPS.map(([share]) => `${usageTone(share)} ${share}%`).join(", ")})`;
