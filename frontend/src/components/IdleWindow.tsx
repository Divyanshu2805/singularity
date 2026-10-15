/**
 * The picture on the preview window's resting and starting states: a small wireframe of an app.
 *
 * Handles: drawing a browser window out of placeholder blocks (a title bar with its address, a heading, two lines of
 * text, a button, a picture and three cards), each block catching a slow sheen in turn, with one band of gold light
 * sweeping down the window as if the page were being read. Resting, it says "there is an app here and it is waiting"
 * without a logo or an icon. Starting (the `stage` prop, the preview's step number), it is built up as the preview
 * is: the title bar stands when a runner is found, the text when the files arrive, the picture and button when the
 * packages are in, the cards when the dev server answers - the parts still to come are faint outlines and the part
 * being built breathes - and the sweep runs faster. Everything is CSS (index.css, .idle-window and its parts), so it
 * costs nothing to draw and stops under reduced motion.
 */
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const bone = (delay: number): CSSProperties => ({ "--d": `${delay}s` }) as CSSProperties;

export function IdleWindow({ stage }: { stage?: number }) {
  const part = (step: number) =>
    stage === undefined ? undefined : stage > step ? "done" : stage === step ? "current" : "todo";

  return (
    <div aria-hidden="true" className={cn("idle-window relative h-[112px] w-[176px] overflow-hidden rounded-xl", stage !== undefined && "idle-window-busy")}>
      <div data-part={part(0)} className="idle-part flex h-[18px] items-center gap-[3px] border-b border-white/[0.08] px-2">
        <span className="h-[5px] w-[5px] rounded-full bg-white/15" />
        <span className="h-[5px] w-[5px] rounded-full bg-white/15" />
        <span className="h-[5px] w-[5px] rounded-full bg-white/15" />
        <span className="idle-bone ml-2 h-[7px] flex-1 rounded-full" style={bone(0)} />
      </div>
      <div className="grid grid-cols-[1fr_58px] gap-2 p-2.5">
        <div className="space-y-1.5">
          <div data-part={part(1)} className="idle-part space-y-1.5">
            <span className="idle-bone block h-2.5 w-4/5" style={bone(0.25)} />
            <span className="idle-bone block h-1.5 w-full" style={bone(0.5)} />
            <span className="idle-bone block h-1.5 w-3/5" style={bone(0.75)} />
          </div>
          <span data-part={part(2)} className="idle-part idle-bone idle-bone-gold mt-2 block h-3.5 w-12 rounded-full" style={bone(1)} />
        </div>
        <span data-part={part(2)} className="idle-part idle-bone block h-[52px]" style={bone(1.25)} />
      </div>
      <div data-part={part(3)} className="idle-part grid grid-cols-3 gap-2 px-2.5">
        <span className="idle-bone block h-[22px]" style={bone(1.5)} />
        <span className="idle-bone block h-[22px]" style={bone(1.75)} />
        <span className="idle-bone block h-[22px]" style={bone(2)} />
      </div>
      <span className="idle-scan" />
    </div>
  );
}
