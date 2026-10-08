/**
 * How much of a person's own message the chat shows before they ask for the rest.
 *
 * Handles: recognising the brief the idea interview compiles and splitting it into the one sentence that says what is
 * being built and everything under it, and deciding when an ordinary message is long enough to fold.
 *
 * The first message of a new project is that brief: six labelled sections and two lists, written for the model. Shown
 * whole it filled the chat window before the answer had begun, and the person had just finished answering the
 * questions it was compiled from. The chat now shows its "Build" sentence - the prompt, in effect - and keeps the
 * rest one click away. Nothing is removed from what is sent or stored; this is only about what is on screen.
 */
export interface SplitBrief {
  headline: string;
  rest: string;
}

const BUILD_LABEL = /^\s*\*\*Build:\*\*[ \t]*/;
const LONG_MESSAGE_CHARS = 700;
const LONG_MESSAGE_LINES = 10;

export function splitBrief(content: string): SplitBrief | null {
  const label = BUILD_LABEL.exec(content);
  if (!label) return null;
  const body = content.slice(label[0].length);
  const lineEnd = body.indexOf("\n");
  if (lineEnd === -1) return null;
  const headline = body.slice(0, lineEnd).trim();
  const rest = body.slice(lineEnd + 1).trim();
  return headline && rest ? { headline, rest } : null;
}

export function isLongMessage(content: string): boolean {
  return content.length > LONG_MESSAGE_CHARS || content.split("\n").length > LONG_MESSAGE_LINES;
}
