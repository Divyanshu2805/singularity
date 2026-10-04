/**
 * A landing section's opening: a small gold label and the section's heading with its italic gold accent,
 * entering together as they scroll into view.
 *
 * Handles: the one intro pattern every section after the hero shares - how it works, the features, the plans and the
 * questions - so the page reads as one sequence and a visitor skimming it can tell at a glance where they are and
 * what each part is about. It is centred by default; a section with a column layout of its own (the questions) sets
 * it flush left. Each intro used to end in a one-line summary under the heading; the owner had every one of them
 * taken out, so the heading now stands alone.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

export function SectionIntro({
  eyebrow,
  title,
  accent,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  accent: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const left = align === "left";

  return (
    <Reveal className={cn(left ? "max-w-xl text-left" : "mx-auto max-w-4xl text-center", className)}>
      <p className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.26em] text-primary">
        {!left && <span aria-hidden="true" className="h-px w-7 bg-gradient-to-r from-transparent to-primary/70" />}
        {eyebrow}
        <span aria-hidden="true" className="h-px w-7 bg-gradient-to-l from-transparent to-primary/70" />
      </p>
      <h2 className="landing-heading mt-4 font-display text-[36px] font-semibold leading-[1.04] tracking-tight sm:text-[54px]">
        {title} <span className="landing-accent italic">{accent}</span>
      </h2>
    </Reveal>
  );
}
