/**
 * The frame a feature demo is shown in, at whatever width its card has.
 *
 * Handles: sizing a demo to its card. The demos are drawn at one design size (FeatureDemos' stage, DESIGN_WIDTH wide
 * and HEIGHT tall), so this enlarges each one to the width it is given rather than leaving small type adrift in a
 * wide card. The size is capped by max: past that the demo is given more room instead of more size, which is what
 * lets a wide card show the windows a narrow one has to drop (index.css, .replica-wide).
 *
 * It enlarges with CSS zoom, not a transform. A transform draws the demo small and stretches the picture, and under
 * a card that tilts in 3D that picture is drawn at one size and resampled to another, which left every film's type
 * soft; zoom lays the demo out at its final size, so its type is drawn sharp. The outer box sets the height the
 * zoomed demo comes to, so the card's layout does not wait on the demo to know its size.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const HEIGHT = 196;
const DESIGN_WIDTH = 350;

export function DemoFrame({ max = 1.22, children }: { max?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0 });

  useLayoutEffect(() => {
    const node = outer.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const scale = Math.min(max, Math.max(1, width / DESIGN_WIDTH));
      setFit((current) => (current.width === width && current.scale === scale ? current : { scale, width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [max]);

  return (
    <div ref={outer} style={{ height: HEIGHT * fit.scale }}>
      <div style={{ width: fit.width ? fit.width / fit.scale : "100%", zoom: fit.scale }}>{children}</div>
    </div>
  );
}
