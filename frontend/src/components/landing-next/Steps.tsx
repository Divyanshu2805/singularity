/**
 * The left-hand side of how it works: the section's heading, the five steps as a timeline, and the celestial
 * instrument that acts out the step being played.
 *
 * Handles: the heading in Fraunces with its last word in the sign-in heading's gold; the steps as one ordered list on
 * a hairline track - each step's dot gold once it is done, ringed in gold while it plays, dim before - with the playing
 * step's line of explanation unfolding under its title (the others fold away), and the track filling with gold as the
 * journey goes (the caller writes its scale through railRef, from the scroll); and under them the instrument card in
 * the sign-in card's material (.auth-panel): the step's instrument (InstrumentCanvas, driven by the progress the
 * caller keeps in a ref) over a caption naming what the instrument shows and where the step has got to, which swaps
 * in when it changes.
 */
import type { MutableRefObject, RefObject } from "react";
import { InstrumentCanvas } from "@/components/cosmos/InstrumentCanvas";
import { cn } from "@/lib/utils";
import { STORY } from "./story";

export interface Caption {
  title: string;
  detail: string;
}

export function Steps({
  active,
  caption,
  progress,
  railRef,
  className,
}: {
  active: number;
  caption: Caption;
  progress: MutableRefObject<number>;
  railRef?: RefObject<HTMLSpanElement>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <p className="ln-eyebrow">How it works</p>
      <h2 className="landing-heading mt-3 text-balance font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.02em] xl:text-[42px]">
        From a sentence to something you can{" "}
        <em className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-1 font-medium not-italic motion-reduce:animate-none">click.</em>
      </h2>

      <ol className="ln-steps relative mt-7">
        <span aria-hidden="true" className="ln-rail">
          <span ref={railRef} className="ln-rail-fill" />
        </span>
        {STORY.map((step, index) => (
          <li
            key={step.name}
            aria-current={index === active ? "step" : undefined}
            data-state={index < active ? "done" : index === active ? "active" : "next"}
            className="ln-step"
          >
            <span aria-hidden="true" className="ln-step-dot" />
            <div className="min-w-0">
              <p className="ln-step-title">
                <span className="ln-step-number">{String(index + 1).padStart(2, "0")}</span>
                {step.title}
              </p>
              <div className="ln-step-fold">
                <p className="ln-step-detail">{step.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="ln-instrument auth-panel relative mt-6 overflow-hidden">
        <div className="ln-instrument-stage">
          <InstrumentCanvas step={active} progress={progress} />
        </div>
        <div className="ln-instrument-caption flex items-center justify-between gap-4 px-4 py-2.5">
          <span key={`t${active}`} className="auth-swap truncate text-[13px] font-medium text-foreground" data-swap>
            {caption.title}
          </span>
          <span key={caption.detail} className="auth-swap shrink-0 text-[12px] text-muted-foreground" data-swap>
            {caption.detail}
          </span>
        </div>
      </div>
    </div>
  );
}
