/**
 * How the pieces of the landing rebuild's hero learn where its opening has got to (the opening itself is
 * Opening.tsx, its timetable lib/opening.ts).
 *
 * Handles: the stage every piece reads (useOpening) - "held" while the cover is up and the page waits for its fonts,
 * "playing" from the moment the cover starts to close, and "over" on a page that has no opening at all - and telling
 * a piece that is not a Motion transition when its beat has come (useBeat): the logo's eclipse, the project
 * window's film and the falling stars start on a timer counted from the moment the stage turned to "playing", the
 * same moment every Motion piece counts its own delay from.
 *
 * "over" is decided once, before the first render, and never arrived at later: a page that plays its opening ends on
 * "playing" with every piece at rest. So a piece can tell from its first render whether it has an entrance to play
 * (anything but "over") and hide itself before it is ever painted. Outside a provider the stage is "over", so a
 * piece shown on some other page is simply there.
 */
import { createContext, useContext, useEffect, useState } from "react";

export type Stage = "held" | "playing" | "over";

export const OpeningContext = createContext<Stage>("over");

export function useOpening() {
  return useContext(OpeningContext);
}

export function useBeat(at: number) {
  const stage = useOpening();
  const [reached, setReached] = useState(stage === "over");

  useEffect(() => {
    if (stage !== "playing" || reached) return;
    const timer = window.setTimeout(() => setReached(true), at);
    return () => window.clearTimeout(timer);
  }, [stage, at, reached]);

  return reached;
}
