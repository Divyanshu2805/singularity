/**
 * One piece of content that rises into place with the scroll.
 *
 * Handles: the two elements scroll-rise.ts needs for each piece - a cell that holds the piece's place in the layout
 * and is what gets measured, and inside it the wrapper that is moved and faded - so a section only has to wrap a card
 * in this and call useScrollRise on a container round them. order is the piece's place in its row; each place waits
 * a little longer than the one before it, so a row arrives one card after another.
 */
import type { ReactNode } from "react";

export function Lift({ order = 0, className, children }: { order?: number; className?: string; children: ReactNode }) {
  return (
    <div data-lift={order} className={className}>
      <div className="h-full">{children}</div>
    </div>
  );
}
