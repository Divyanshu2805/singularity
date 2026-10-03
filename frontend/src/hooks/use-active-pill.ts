/**
 * The highlight under the sidebar row for the page you are on, which glides to the new row when you navigate - the
 * partner of use-glide-highlight's hover pill, as in the owner's BitBin sidebar.
 *
 * Handles: finding the current row (the data-glide row marked aria-current="page" inside the container), writing its
 * box into the pill's CSS variables (--ax, --ay, --aw, --ah) so the glide itself is a CSS transition (index.css,
 * .active-pill), hiding the pill when there is no current row or it can't be seen (it sits in an inert block - a
 * folded group, or the project groups while the sidebar is closed to its rail), and keeping it on its row as things
 * move around it.
 *
 * Every page renders its own sidebar, so going from one page to another mounts a new one and its pill has nowhere to
 * glide from. The pill therefore remembers where it last sat (lastPlacement, module state): a new sidebar puts its pill
 * there first (and forces a style flush, so the browser has it at the old spot before the glide is set) and glides it
 * to the new row, which reads as one pill moving because the sidebar is in the same place on every page. Within a page a navigation (the caller passes something that changes with the route as `key`) glides the
 * pill directly.
 *
 * Anything else that moves the row - the panel's width sliding open or shut, a group folding, a list scrolling,
 * projects arriving - snaps the pill into place on the next frame so it never trails its row, except during a glide,
 * when it retargets the glide instead of cutting it short. A resize observer reports once as soon as it starts
 * watching; that first report is ignored, or it would snap every glide a frame after it began.
 */
import { useEffect, useRef, type RefObject } from "react";

const GLIDE_MS = 400;

interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

let lastPlacement: Placement | null = null;

function write(pill: HTMLElement, placement: Placement, snap: boolean) {
  pill.dataset.snap = String(snap);
  pill.style.setProperty("--ax", `${placement.x}px`);
  pill.style.setProperty("--ay", `${placement.y}px`);
  pill.style.setProperty("--aw", `${placement.w}px`);
  pill.style.setProperty("--ah", `${placement.h}px`);
  pill.dataset.on = "true";
}

function measure(container: HTMLElement): Placement | null {
  const row = container.querySelector<HTMLElement>('[data-glide][aria-current="page"]');
  if (!row || row.closest("[inert]")) return null;
  const rect = row.getBoundingClientRect();
  if (rect.height === 0) return null;
  const box = container.getBoundingClientRect();
  return { x: rect.left - box.left, y: rect.top - box.top, w: rect.width, h: rect.height };
}

export function useActivePill<T extends HTMLElement>(containerRef: RefObject<T>, key: unknown) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const glidingUntilRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;
    let frame = 0;
    let primed = false;

    const follow = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const placement = measure(container);
        if (!placement) {
          pill.dataset.on = "false";
          return;
        }
        const gliding = performance.now() < glidingUntilRef.current;
        write(pill, placement, !gliding);
        lastPlacement = placement;
      });
    };

    const resize = new ResizeObserver(() => {
      if (primed) follow();
      primed = true;
    });
    resize.observe(container);
    const mutations = new MutationObserver(follow);
    mutations.observe(container, { subtree: true, childList: true, attributeFilter: ["inert"] });
    container.addEventListener("scroll", follow, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      container.removeEventListener("scroll", follow, true);
    };
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;
    if (pill.dataset.on !== "true" && lastPlacement) {
      write(pill, lastPlacement, true);
      void pill.getBoundingClientRect();
    }
    const frame = window.requestAnimationFrame(() => {
      const placement = measure(container);
      if (!placement) {
        pill.dataset.on = "false";
        lastPlacement = null;
        return;
      }
      const from = pill.dataset.on === "true";
      glidingUntilRef.current = performance.now() + GLIDE_MS;
      write(pill, placement, !from);
      lastPlacement = placement;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, key]);

  return pillRef;
}
