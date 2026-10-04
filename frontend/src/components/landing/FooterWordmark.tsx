/**
 * The footer's closing wordmark: "Singularity" set in heavy type across the full width of the page, quiet and
 * low-contrast, cut off at its foot by a hairline, rising letter by letter out of that line as the visitor scrolls to
 * the end of the page.
 *
 * Handles: sizing the name so it spans the footer's width edge to edge (measured, not guessed, so it fits at any width
 * and once the web font has loaded), tracking how far the visitor has scrolled into the last stretch of the page and
 * publishing it as one CSS variable (--reveal, 0 to 1) that the letters and the hairline read - the letters rising
 * out of the line one after another, the line lighting up gold from the centre - marking the wordmark settled once
 * the name has fully risen, which sets a spark of light travelling along the line, and each letter lifting and brightening
 * a little under the pointer.
 *
 * It closes the page on the motif the landing intro opens with - a line of light that something rises out of. The
 * reveal is scrubbed by scroll rather than played once, so it moves with the visitor's own scrolling (which Lenis
 * already smooths); a short transition on the letters absorbs jumps such as the End key. Progress is measured against
 * the end of the document, not the wordmark's own box, so the name finishes rising exactly as the page runs out of
 * scroll, whatever sits below it. The scroll listener runs only while the wordmark is near the viewport and writes a
 * single style per animation frame. Each letter carries its own vertical gradient, fading out towards the line (a
 * word-wide gradient can't follow letters that move on their own layers), and the row clips them, so they come up
 * through the line rather than fading in. Under reduced motion the name simply stands on its line.
 *
 * It was taken out for a day when the footer's black hole (FooterHole) went in above the links - the owner had asked
 * for "this section at the bottom" to go - and then asked for back, so the page now ends on both: the hole above the
 * footer, the name under its links.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./motion";

const LETTERS = [..."Singularity"].map((char) => ({ char, hot: false }));

export function FooterWordmark({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    const row = rowRef.current;
    if (!node || !row) return;
    const fit = () => {
      const width = Math.min(node.clientWidth * 0.92, 1560);
      if (!width) return;
      node.style.fontSize = "100px";
      const natural = row.scrollWidth;
      if (natural) node.style.fontSize = `${Math.floor((width / natural) * 100 * 10) / 10}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    const sizes = new ResizeObserver(fit);
    sizes.observe(node);
    return () => sizes.disconnect();
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced) {
      node.style.setProperty("--reveal", "1");
      node.dataset.settled = "false";
      return;
    }

    let frame = 0;
    let below = 0;
    let settled = false;
    const measure = () => {
      const box = node.getBoundingClientRect();
      below = Math.max(0, document.documentElement.scrollHeight - (box.bottom + window.scrollY));
    };
    const update = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const reveal = Math.min(1, Math.max(0, ((window.innerHeight - box.top) / (box.height + below)) * 1.15));
      node.style.setProperty("--reveal", reveal.toFixed(4));
      if (reveal >= 0.995 !== settled) {
        settled = reveal >= 0.995;
        node.dataset.settled = String(settled);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      schedule();
    };

    measure();
    update();
    let listening = false;
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) window.addEventListener("scroll", schedule, { passive: true });
      else window.removeEventListener("scroll", schedule);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        listen(entry.isIntersecting);
        if (entry.isIntersecting) onResize();
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(node);
    const sizes = new ResizeObserver(onResize);
    sizes.observe(document.body);
    return () => {
      listen(false);
      observer.disconnect();
      sizes.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div ref={ref} role="img" aria-label="Singularity" className={cn("wordmark relative select-none", className)}>
      <span ref={rowRef} className="wordmark-row">
        {LETTERS.map(({ char, hot }, index) => (
          <span key={index} className={cn("wordmark-letter", hot && "wordmark-hot")} style={{ "--i": index } as CSSProperties}>
            {char}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="wordmark-horizon">
        <span className="wordmark-spark" />
      </span>
    </div>
  );
}
