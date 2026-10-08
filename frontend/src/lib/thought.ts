/**
 * The model's working-out, cut into the separate thoughts it is made of.
 *
 * Handles: turning the body of an approach block into a list of steps - one per line, or one per sentence when the
 * model wrote a single paragraph - without list markers, and holding back the step still being written while the
 * block is arriving.
 *
 * The chat shows these one at a time at a readable pace (hooks/use-step-reveal.ts) instead of typing the text out,
 * so a step must only ever be handed over whole: a half-arrived last line would show as a step that then rewrites
 * itself.
 */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;
const SENTENCE_END = /(?<=[.!?])\s+(?=\S)/;

export function thoughtSteps(content: string, isComplete: boolean): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter(Boolean);
  const steps = lines.length === 1 ? lines[0].split(SENTENCE_END).map((part) => part.trim()).filter(Boolean) : lines;
  return isComplete ? steps : steps.slice(0, -1);
}
