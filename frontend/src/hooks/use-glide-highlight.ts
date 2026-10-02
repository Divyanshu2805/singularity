/**
 * One hover highlight that glides between the rows of a list instead of each row lighting up on its own - the landing
 * navigation's hover pill, for the app's sidebar.
 *
 * Handles: finding the row under the pointer (anything marked data-glide inside the container; a row marked
 * data-glide-none, which paints its own hover, clears the highlight instead of leaving it on the row before), moving a single
 * highlight onto it by writing its box into CSS variables (--gx, --gy, --gw, --gh) that the highlight's transform and
 * size read, so the glide itself is a CSS transition (index.css, .glide-pill); fading it out when the pointer leaves
 * the container; and following the row when a list inside the container scrolls under a still pointer.
 *
 * A highlight that is appearing is placed without a transition (data-snap) and fades in where it lands, rather than
 * sliding in from wherever it last was - the same rule the landing navigation follows. Positions are measured from the
 * row's own box against the container's at the moment of hover, so rows of any height, nested lists and collapsing
 * sections all work without the caller doing any bookkeeping.
 */
import { useEffect, useRef, type RefObject } from "react";

export function useGlideHighlight<T extends HTMLElement>(containerRef: RefObject<T>) {
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;
    let target: HTMLElement | null = null;
    let frame = 0;

    const hide = () => {
      target = null;
      pill.dataset.on = "false";
    };

    const place = (snap: boolean) => {
      if (!target || !target.isConnected) {
        hide();
        return;
      }
      const box = container.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      pill.dataset.snap = String(snap);
      pill.style.setProperty("--gx", `${rect.left - box.left}px`);
      pill.style.setProperty("--gy", `${rect.top - box.top}px`);
      pill.style.setProperty("--gw", `${rect.width}px`);
      pill.style.setProperty("--gh", `${rect.height}px`);
      pill.dataset.on = "true";
    };

    const onOver = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-glide-none]")) {
        hide();
        return;
      }
      const next = (event.target as Element | null)?.closest<HTMLElement>("[data-glide]");
      if (!next || !container.contains(next) || next === target) return;
      const showing = pill.dataset.on === "true";
      target = next;
      place(!showing);
    };

    const onScroll = () => {
      if (!target) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => place(true));
    };

    container.addEventListener("pointerover", onOver);
    container.addEventListener("pointerleave", hide);
    container.addEventListener("scroll", onScroll, true);
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("pointerover", onOver);
      container.removeEventListener("pointerleave", hide);
      container.removeEventListener("scroll", onScroll, true);
    };
  }, [containerRef]);

  return pillRef;
}
