/** More ticks than this and a long chat would draw a rail down the whole panel, so a window is shown instead. */
export const MAX_RAIL_TICKS = 18;

/**
 * A ceiling on the label, not a display width: the row glides the whole thing into view on hover, so this only
 * stops a one-line brief that runs to a paragraph from taking an age to read past.
 */
const MAX_LABEL_CHARS = 120;

/** A message's first meaningful line, with markdown markers stripped - what the scroll rail's list shows for it. */
export function messageLabel(content: string): string {
  const line = content
    .split("\n")
    .map((part) => part.replace(/^(\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+))+/, "").replace(/[*_`]/g, "").trim())
    .find((part) => part.length > 0) ?? "";
  if (!line) return "Message";
  return line.length > MAX_LABEL_CHARS ? `${line.slice(0, MAX_LABEL_CHARS).trimEnd()}…` : line;
}
