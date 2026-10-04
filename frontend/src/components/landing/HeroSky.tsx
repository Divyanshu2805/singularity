/**
 * The app's own sky behind the home page's hero: the breathing wash of colour the signed-in pages and the sign-in
 * page stand on (components/app/Nebula.tsx), so the landing page and the app read as one place.
 *
 * Handles: placing that wash where the app has it - fixed to the window, standing up from its foot - over the
 * landing's starfield (stars = false, as the sign-in page uses it, since the stars are already there), and letting
 * go of it as the hero is scrolled away: it is at full strength while the hero's foot is at or below the window's
 * foot (HELD), fades as that foot rises, and is gone - and taken out of the paint - by the time the foot is GONE of
 * the way up the window. So the wash belongs to the hero and the sections under it still stand on the bare stars;
 * a wash that simply ended at the hero's foot would show as a hard edge, since it is brightest at the foot of its
 * box. The fade is written straight to the element from one animation-frame-batched scroll listener.
 *
 * The wash's strength here is home.css's (.hero-sky), a little under the dashboard's: on this page a headline, a
 * grid and a lit prompt stand over it.
 */
import { useEffect, useRef, type RefObject } from "react";
import { Nebula } from "@/components/app/Nebula";

const HELD = 1;
const GONE = 0.3;

export function HeroSky({ hero }: { hero: RefObject<HTMLElement> }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    const section = hero.current;
    if (!node || !section) return;
    let frame = 0;
    let shown = -1;
    const update = () => {
      frame = 0;
      const view = window.innerHeight;
      const level = Math.min(1, Math.max(0, (section.getBoundingClientRect().bottom - view * GONE) / (view * (HELD - GONE))));
      if (level === shown) return;
      shown = level;
      node.style.opacity = level.toFixed(3);
      node.style.visibility = level > 0 ? "visible" : "hidden";
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [hero]);

  return (
    <div ref={ref} aria-hidden="true" className="hero-sky pointer-events-none fixed inset-0">
      <Nebula stars={false} className="absolute" />
    </div>
  );
}
