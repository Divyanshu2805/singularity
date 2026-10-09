/**
 * The first-run guide: a small card that points at one part of a project's page at a time.
 *
 * Handles: finding each step's part of the page by its data-guide attribute, drawing a soft ring around it and the
 * card beside it (lib/guide places it), following the part when the window is resized or a panel slides, stepping
 * forward and back, and closing - by Skip, by Done on the last step, or by Escape.
 *
 * It does not cover the page or stop it being used: the ring and the card float over it and everything underneath
 * still works, so a person can simply start typing and the guide is in nobody's way. It is shown by itself only the
 * first time a person opens a project they can build in; after that it opens only from the header's help button.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { availableSteps, guideAnchorSelector, placeCard, type Box, type CardPlacement, type GuideStep } from "@/lib/guide";

const CARD_WIDTH = 300;
const FOLLOW_MS = 400;

const findAnchor = (anchor: string) => document.querySelector<HTMLElement>(guideAnchorSelector(anchor));

export function WorkspaceGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [placement, setPlacement] = useState<CardPlacement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSteps(availableSteps((anchor) => !!findAnchor(anchor)));
    setIndex(0);
  }, [open]);

  const step = open ? steps[index] : undefined;

  const measure = useCallback(() => {
    if (!step) return;
    const element = findAnchor(step.anchor);
    const card = cardRef.current;
    if (!element || !card) return;
    const rect = element.getBoundingClientRect();
    const box = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    setTarget((prev) =>
      prev && prev.top === box.top && prev.left === box.left && prev.width === box.width && prev.height === box.height ? prev : box
    );
    const placed = placeCard(box, { width: CARD_WIDTH, height: card.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    setPlacement((prev) => (prev && prev.top === placed.top && prev.left === placed.left ? prev : placed));
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    measure();
    window.addEventListener("resize", measure);
    const follow = window.setInterval(measure, FOLLOW_MS);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(follow);
    };
  }, [step, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!step) return null;
  const isLast = index === steps.length - 1;

  return (
    <>
      {target && (
        <div
          aria-hidden="true"
          style={{ top: target.top - 4, left: target.left - 4, width: target.width + 8, height: target.height + 8 }}
          className="pointer-events-none fixed z-[60] rounded-xl border border-primary/70 shadow-[0_0_0_4px_hsl(var(--primary)/0.14)] transition-all duration-300 motion-reduce:transition-none"
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label="A quick look around"
        style={{ width: CARD_WIDTH, top: placement?.top ?? 0, left: placement?.left ?? 0, visibility: placement ? "visible" : "hidden" }}
        className="app-menu app-menu-raised chat-enter fixed z-[61] rounded-2xl border p-4 transition-[top,left] duration-300 motion-reduce:transition-none"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium text-muted-foreground">
            {index + 1} of {steps.length}
          </p>
          <button type="button" aria-label="Close the guide" onClick={onClose} className="icon-btn -mr-1.5 -mt-1.5 h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground">{step.title}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-3.5 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground">
            {isLast ? "" : "Skip"}
          </button>
          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((current) => current - 1)}
                className="btn btn-glass flex h-7 items-center rounded-full px-3 text-xs font-semibold text-foreground/90"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : setIndex((current) => current + 1))}
              className="btn btn-primary flex h-7 items-center rounded-full px-3.5 text-xs font-semibold"
            >
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
