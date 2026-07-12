import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough to read the tick, short enough that the button is back to itself before you look again. */
const COPY_FEEDBACK_MS = 1500;

/**
 * "Copy this, then say you did" - the tick-then-revert behaviour shared by the header copy buttons in both
 * chats. Kept in one place because the two are meant to feel identical; `MessageActions` has its own copy of
 * this for per-message copying, where the state is tangled up with that row's hover reveal.
 *
 * <p>A refused clipboard (denied permission, an unfocused document, a non-secure origin) is swallowed: no
 * tick appears, so nothing claims to have copied, and the export button next to it still gets the same text
 * out. The timer is cleared on unmount, so a panel closed straight after copying doesn't set state on a
 * component that has gone.
 */
export function useCopyFeedback(): [copied: boolean, copy: (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(resetRef.current), []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      window.clearTimeout(resetRef.current);
      setCopied(true);
      resetRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard unavailable or refused - say nothing rather than claim a copy that didn't happen.
    }
  }, []);

  return [copied, copy];
}
