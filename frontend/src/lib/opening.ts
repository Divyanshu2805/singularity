/**
 * The arithmetic and the timetable of the landing rebuild's opening (components/genesis/Opening.tsx and Hero.tsx),
 * kept free of the DOM so it can be tested.
 *
 * Handles: the beats of the sequence (OPENING), each in milliseconds from the moment the cover starts to close;
 * turning a beat into the delay and duration Motion takes, in seconds (beat); and the size the cover has to be to
 * hide a screen (coverSide) - the cover is a square with rounded corners (ROUND of its side) centred on the screen,
 * so it has to be wide enough that the screen's corners are still inside its rounded ones.
 *
 * The cover's beats were read off a recording of the reference page the owner asked to have matched, frame by frame:
 * it closes on the tile over 850ms on an ease-in-out cubic, is a thin ring round the tile by about 700ms and gone by
 * 750ms, and the tile goes after it. Behind it the page is kept simple, at the owner's request ("make the animation
 * smooth by removing unnecessary useless things"): the copy's five pieces come up one after another (copy, step
 * apart), the project window comes up once as a whole, and only when all of that has landed do the things that run
 * on - the logo's eclipse, the window's film and the falling stars - begin, so nothing has to share those first
 * frames with them. What was dropped on the way: a badge and a note that typed themselves, the headline coming out
 * of a blur, the window's panels arriving one by one and a ribbon of threads sweeping in last.
 */
export const ROUND = 0.28;
export const TILE = 80;

export const OPENING = {
  hold: 280,
  cover: { at: 0, for: 850 },
  coverGone: [0.84, 0.885],
  tile: { at: 720, for: 180 },
  copy: { at: 160, for: 700, step: 80 },
  window: { at: 380, for: 800 },
  mark: 900,
  film: 1250,
  stars: 1500,
} as const;

export const COVER_EASE = [0.65, 0, 0.35, 1] as const;
export const RISE_EASE = [0.2, 0.7, 0.2, 1] as const;

export function beat({ at, for: duration }: { at: number; for: number }) {
  return { delay: at / 1000, duration: duration / 1000 };
}

export function insideCover(x: number, y: number, side: number) {
  const half = side / 2;
  const radius = side * ROUND;
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  if (Math.abs(x) > half || Math.abs(y) > half) return false;
  return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= radius * radius;
}

export function coverSide(width: number, height: number) {
  const a = width / 2;
  const b = height / 2;
  const inset = 0.5 - ROUND;
  const curve = 2 * inset * inset - ROUND * ROUND;
  const reach = inset * (a + b);
  const onArc = (reach - Math.sqrt(reach * reach - curve * (a * a + b * b))) / curve;
  return Math.max(width, height, onArc);
}
