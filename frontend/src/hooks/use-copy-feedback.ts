/**
 * "Copy this, then say you did" - the tick-then-revert behaviour shared by the header copy buttons in both chats.
 *
 * Handles: writing to the clipboard, showing the tick briefly, and clearing its timer on unmount so a panel closed
 * straight after copying does not set state on a component that has gone.
 *
 * A refused clipboard - denied permission, an unfocused document, a non-secure origin - is swallowed: no tick
 * appears, so nothing claims to have copied, and the export button next to it still gets the same text out.
 * Per-message copying has its own copy of this, where the state is tangled up with that row's hover reveal.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const COPY_FEEDBACK_MS = 1500;

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
    }
  }, []);

  return [copied, copy];
}
