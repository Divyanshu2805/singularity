/**
 * The measured box of the active option in a segmented switch, for the selection pill that slides to it.
 *
 * Handles: reading the active option's left and width from the list (options size to their labels, so nothing is
 * assumed), re-measuring when any option resizes, and handing back a style for an absolutely positioned
 * .seg-pill.seg-slide element (index.css), whose left and width ease on different curves so it stretches like liquid
 * as it travels. The first measure is placed without a transition so the pill never slides in from the corner.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

export function useSlidingPill<T extends HTMLElement>(listRef: RefObject<T>, activeIndex: number, optionSelector: string) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const placed = useRef(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const option = list.querySelectorAll<HTMLElement>(optionSelector)[activeIndex];
      if (option) setBox({ left: option.offsetLeft, width: option.offsetWidth });
    };
    place();
    const observer = new ResizeObserver(place);
    list.querySelectorAll(optionSelector).forEach((option) => observer.observe(option));
    return () => observer.disconnect();
  }, [listRef, activeIndex, optionSelector]);

  useLayoutEffect(() => {
    if (box && !placed.current) {
      placed.current = true;
      const frame = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [box]);

  const style: CSSProperties | undefined = box ? { left: box.left, width: box.width, transition: ready ? undefined : "none" } : undefined;
  return style;
}
