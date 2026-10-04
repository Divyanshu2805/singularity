/**
 * A section heading on the new landing page: a small gold eyebrow over a Fraunces headline whose last words are set in
 * the sign-in heading's gold - "Welcome back" is the pattern - and no line of summary under it, which the owner had
 * taken off every section of the old landing page.
 *
 * Handles: setting the eyebrow and the headline, aligned to the centre or the start, and bringing them in the first
 * time they come into view - the eyebrow rising, then each word of the headline condensing into place out of a slight
 * blur and drift, one after another (.ln-words, transitions with a delay per word, so nothing runs per frame). Under
 * reduced motion they are simply there.
 */
import { type CSSProperties } from "react";
import { useInView } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

export function Heading({ eyebrow, title, accent, align = "center", id, className }: { eyebrow: string; title: string; accent: string; align?: "center" | "start"; id?: string; className?: string }) {
  const [ref, shown] = useInView<HTMLDivElement>({ threshold: 0.4 });
  const words = title.split(" ");

  return (
    <div ref={ref} data-shown={shown} className={cn("ln-words", align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl", className)}>
      <p className="ln-eyebrow ln-word" style={{ "--w": 0 } as CSSProperties}>
        {eyebrow}
      </p>
      <h2 id={id} className="landing-heading mt-3 text-balance font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.022em] sm:text-[48px] lg:text-[56px]">
        {words.map((word, index) => (
          <span key={index}>
            <span className="ln-word inline-block" style={{ "--w": index + 1 } as CSSProperties}>
              {word}
            </span>{" "}
          </span>
        ))}
        <em className="ln-word heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-1 font-medium not-italic motion-reduce:animate-none" style={{ "--w": words.length + 1 } as CSSProperties}>
          {accent}
        </em>
      </h2>
    </div>
  );
}
