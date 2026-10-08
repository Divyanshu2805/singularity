/**
 * Lets a list of steps appear one at a time, at a pace a person can follow.
 *
 * Handles: counting up from the first step to the last, one step per interval, with the whole span capped so a long
 * list is not slower than the work it describes; leaving the last step on show for one more interval before the list
 * counts as finished; and showing every step at once for a list that is already finished when it first appears - a
 * saved conversation, or a reopened chat.
 *
 * The model's thoughts arrive in one burst, so showing them as they arrive would be all at once. Revealing them on a
 * timer gives the sense of a line of reasoning without delaying anything else: the rest of the turn does not wait for
 * the last step to be shown. Whether to pace is decided once, when the list first appears - a turn that is still being
 * written paces its thoughts even if they arrived whole, and a turn that is long over never does - and it keeps going
 * after the turn ends until the last step is out. A list still being written reports itself as revealing even when
 * every step so far is showing, since another may follow.
 */
import { useEffect, useState } from "react";

const STEP_MS = 700;
const MAX_TOTAL_MS = 3200;

export function useStepReveal(total: number, paced: boolean, arriving: boolean): { shown: number; isRevealing: boolean } {
  const [isPaced] = useState(paced);
  const [shown, setShown] = useState(() => (paced ? Math.min(1, total) : total));
  const [hasSettled, setHasSettled] = useState(!paced);

  const allShown = shown >= total;
  const interval = Math.min(STEP_MS, MAX_TOTAL_MS / Math.max(total, 1));

  useEffect(() => {
    if (!isPaced || allShown) return;
    const timer = window.setTimeout(() => setShown((count) => Math.min(count + 1, total)), shown === 0 ? 0 : interval);
    return () => window.clearTimeout(timer);
  }, [isPaced, allShown, total, shown, interval]);

  useEffect(() => {
    if (!isPaced || hasSettled || arriving || !allShown || total === 0) return;
    const timer = window.setTimeout(() => setHasSettled(true), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [isPaced, hasSettled, arriving, allShown, total]);

  const visible = isPaced ? Math.min(shown, total) : total;
  return { shown: visible, isRevealing: arriving || visible < total || !hasSettled };
}
