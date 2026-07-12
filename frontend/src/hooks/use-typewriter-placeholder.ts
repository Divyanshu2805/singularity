import { useEffect, useRef, useState } from "react";

const TYPE_MS = 38;
const DELETE_MS = 22;
const HOLD_MS = 1500;
const GAP_MS = 400;

type Mode = "typing" | "holding" | "deleting" | "gap";

/**
 * Types out each phrase into a returned string, holds it briefly, deletes it,
 * then moves to the next - the rotating example-prompt effect Lovable shows
 * in its empty prompt box. Meant to be fed straight into a native `placeholder`
 * prop (which re-renders fine on every keystroke-sized update).
 *
 * Progress (phrase index / char index / mode) lives in refs, not state, so
 * pausing (`enabled: false`, e.g. once the user has typed something) and
 * resuming later picks back up mid-phrase instead of restarting.
 */
export function useTypewriterPlaceholder(phrases: string[], enabled: boolean): string {
  const [text, setText] = useState("");
  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const modeRef = useRef<Mode>("typing");

  useEffect(() => {
    if (!enabled || phrases.length === 0) return;

    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = phrases[phraseIndexRef.current % phrases.length];

      switch (modeRef.current) {
        case "typing": {
          charIndexRef.current += 1;
          setText(phrase.slice(0, charIndexRef.current));
          if (charIndexRef.current >= phrase.length) {
            modeRef.current = "holding";
            timeout = setTimeout(tick, HOLD_MS);
          } else {
            timeout = setTimeout(tick, TYPE_MS);
          }
          break;
        }
        case "holding": {
          modeRef.current = "deleting";
          timeout = setTimeout(tick, DELETE_MS);
          break;
        }
        case "deleting": {
          charIndexRef.current -= 1;
          setText(phrase.slice(0, Math.max(0, charIndexRef.current)));
          if (charIndexRef.current <= 0) {
            modeRef.current = "gap";
            phraseIndexRef.current += 1;
            timeout = setTimeout(tick, GAP_MS);
          } else {
            timeout = setTimeout(tick, DELETE_MS);
          }
          break;
        }
        case "gap": {
          modeRef.current = "typing";
          timeout = setTimeout(tick, TYPE_MS);
          break;
        }
      }
    };

    timeout = setTimeout(tick, TYPE_MS);
    return () => clearTimeout(timeout);
  }, [enabled, phrases]);

  return text;
}
