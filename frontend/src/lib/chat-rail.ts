/**
 * The label the chat's scroll rail shows for a message.
 *
 * Handles: finding a message's first meaningful line, stripping markdown markers from it, and capping its length.
 *
 * The cap is a ceiling on the text, not a display width - the row glides the whole label into view on hover - so it
 * only stops a one-line brief that runs to a paragraph from taking an age to read past.
 */
export const MAX_RAIL_TICKS = 18;

const MAX_LABEL_CHARS = 120;

export function messageLabel(content: string): string {
  const line = content
    .split("\n")
    .map((part) => part.replace(/^(\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+))+/, "").replace(/[*_`]/g, "").trim())
    .find((part) => part.length > 0) ?? "";
  if (!line) return "Message";
  return line.length > MAX_LABEL_CHARS ? `${line.slice(0, MAX_LABEL_CHARS).trimEnd()}…` : line;
}
