/**
 * The app's working indicator: a gold planet with a fading tail circling a faint ring - the one loader every wait in
 * the app uses (buttons, steps, the chat, whole pages), so a wait looks the same wherever it happens. It was a point
 * breathing at the centre of a ring with ripples spreading from it; the owner asked for the planet going round, with
 * its tail, instead. It is not drawn round the horizon mark on the whole-page states: there the owner wanted the black
 * hole alone.
 *
 * Handles: the ring, the tail (an arc of the ring that fades behind the planet), the planet (the child span, which
 * the CSS places at the top of the ring), the turn of the whole thing, and, given a label, announcing itself as a
 * status to a screen reader (without one it is decoration beside text that already says what is happening).
 *
 * It is sized by its box, like the icons it replaces (h-3.5 w-3.5 and so on), and drawn entirely in CSS (index.css,
 * .orbit-spinner): one transform that turns, so it costs a composited property and nothing per frame. Under reduced
 * motion it holds still with the planet at the top of its ring.
 */
import { cn } from "@/lib/utils";

export function OrbitSpinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("orbit-spinner h-4 w-4", className)}
    >
      <span className="orbit-spinner-comet" />
    </span>
  );
}
