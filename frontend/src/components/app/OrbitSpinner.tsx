/**
 * The app's working indicator: a small comet circling a faint orbit, the landing pour's comet in miniature, in
 * place of a plain spinning icon.
 *
 * Handles: the faint track, the trail brightening from nothing to pale gold towards the head, and the head itself - a
 * bright point with a soft glow - circling once a second; and, given a label, announcing itself as a status to a
 * screen reader (without one it is decoration beside text that already says what is happening).
 *
 * It is sized by its box, like the icons it replaces (h-3.5 w-3.5 and so on), and drawn entirely in CSS (index.css,
 * .orbit-spinner): the trail is a conic gradient masked to a ring and the whole comet turns as one transform, so it
 * costs a composited rotation and nothing per frame. Under reduced motion it holds still as a lit arc.
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
