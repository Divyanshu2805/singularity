/**
 * Turning an error the preview threw into a request the build chat can act on.
 *
 * Handles: saying in one plain sentence what kind of thing went wrong, for someone who has never read a stack trace;
 * working out which project file and line the error points at from the address the preview reported; writing the
 * message that asks for a fix, with the error, the place and the top of the stack; recognising the same error when it
 * comes back; and deciding whether a fix may still be offered for it. A page that loaded and drew nothing is treated
 * as an error too: it has no message of its own, so it is given one, and the request for a fix says what is known -
 * that the app starts and nothing appears.
 *
 * A "Fix issues" button once did this and was taken out, because the turn it started wrote the whole file again and
 * regularly broke something else in it. A change is now an edit of the lines that change, so the request says so in
 * as many words - fix this, with the smallest change that works, and nothing else - and the button is back.
 *
 * It cannot loop. The same error may be sent for a fix twice; if it is still there after that, the model has had its
 * chances with what the error alone can tell it, and the person is asked to say in the chat what they were doing,
 * which is the thing the error does not hold. "The same error" ignores what changes between two runs of the same
 * fault - line and column numbers, the cache-busting query on a file's address - or a fix that only moved the line
 * would count as a new error for ever.
 */
export interface RuntimeError {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  filename?: string;
  stack?: string;
}

export const MAX_FIX_ATTEMPTS = 2;

export const BLANK_PAGE_SOURCE = "Blank page";

export const blankPageError = (): RuntimeError => ({
  source: BLANK_PAGE_SOURCE,
  message: "The page loaded, but nothing is drawn on it.",
});

export const isBlankPage = (error: RuntimeError | null | undefined) => error?.source === BLANK_PAGE_SOURCE;

const MAX_MESSAGE_CHARS = 600;
const MAX_STACK_LINES = 8;
const MAX_STACK_LINE_CHARS = 200;

interface Explanation {
  pattern: RegExp;
  say: (match: RegExpMatchArray) => string;
}

const EXPLANATIONS: Explanation[] = [
  {
    pattern: /Failed to resolve import ["']([^"']+)["']/i,
    say: (match) => `A file tries to load "${match[1]}", which isn't in the project or isn't installed.`,
  },
  {
    pattern: /does not provide an export named ['"]?([\w$]+)/i,
    say: (match) => `A file asks another file for "${match[1]}", but that file doesn't offer anything by that name.`,
  },
  {
    pattern: /([\w$.]+) is not defined/i,
    say: (match) => `The code uses "${match[1]}", but nothing by that name was ever created or brought in.`,
  },
  {
    pattern: /Cannot read propert(?:y|ies) of (undefined|null) \(reading ['"]([^'"]+)['"]\)/i,
    say: (match) => `The code looked for "${match[2]}" on something that was empty at that moment.`,
  },
  {
    pattern: /([\w$.]+) is not a function/i,
    say: (match) => `The code tried to run "${match[1]}" as an action, but it isn't one.`,
  },
  {
    pattern: /Maximum update depth exceeded|Too many re-renders/i,
    say: () => "Part of the page keeps updating itself in a loop and never settles.",
  },
  {
    pattern: /Rendered (more|fewer) hooks|Invalid hook call/i,
    say: () => "A piece of the page uses React's built-in helpers in a way React doesn't allow.",
  },
  {
    pattern: /Objects are not valid as a React child/i,
    say: () => "The page tried to show a whole bundle of data where only text or a number can go.",
  },
  {
    pattern: /Unexpected token|Unterminated|Expected ["'`,;)}\]]|SyntaxError/i,
    say: () => "There is a typing mistake in the code - a missing or extra bracket, quote or comma.",
  },
  {
    pattern: /Failed to fetch|NetworkError|Load failed/i,
    say: () => "The app asked for something over the network and got no answer.",
  },
];

export function plainWords(error: RuntimeError): string {
  if (isBlankPage(error)) {
    return "The app started, but the page is empty. Usually the code that draws the page stopped before it could, or draws nothing yet.";
  }
  for (const { pattern, say } of EXPLANATIONS) {
    const match = error.message.match(pattern);
    if (match) return say(match);
  }
  return "Something in the app's code failed while it was running.";
}

/** The project path an address inside the preview points at, or null when it is not one of the project's files. */
export function projectFileOf(address: string | undefined): string | null {
  if (!address) return null;
  let path = address;
  try {
    path = new URL(address, "http://preview.invalid").pathname;
  } catch {
    return null;
  }
  path = decodeURIComponent(path).replace(/^\/+/, "");
  if (!path || path.startsWith("node_modules/") || path.startsWith("@") || path.includes("/node_modules/")) return null;
  return /\.(tsx?|jsx?|css|html|json)$/.test(path) ? path : null;
}

export function errorPlace(error: RuntimeError): string | null {
  const file = projectFileOf(error.filename);
  if (!file) return null;
  return error.lineno && error.lineno > 0 ? `${file}, line ${error.lineno}` : file;
}

export function fixRequestFor(error: RuntimeError): string {
  const message = error.message.trim().slice(0, MAX_MESSAGE_CHARS);
  const place = errorPlace(error);
  const stack = (error.stack ?? "")
    .split("\n")
    .map((line) => line.trim().slice(0, MAX_STACK_LINE_CHARS))
    .filter((line) => line && !line.includes("node_modules"))
    .slice(0, MAX_STACK_LINES);

  if (isBlankPage(error)) {
    return [
      "The preview starts, but the page is blank: nothing is drawn and no error is shown.",
      "Find what stops the app from rendering - start from index.html and src/main.tsx - and fix it with the smallest change that works. Change nothing else.",
    ].join("\n\n");
  }

  const parts = [
    "The preview shows this error. Fix it with the smallest change that works, and change nothing else.",
    `Error: ${message}`,
  ];
  if (place) parts.push(`Where: ${place}`);
  if (stack.length > 0) parts.push(`Stack:\n${stack.join("\n")}`);
  return parts.join("\n\n");
}

export function errorSignature(error: RuntimeError): string {
  const message = error.message
    .replace(/\?[tv]=[\w.-]+/g, "")
    .replace(/:\d+(:\d+)?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${projectFileOf(error.filename) ?? ""}|${message.slice(0, 300)}`;
}

export type FixOffer = "offer" | "exhausted";

export function fixOffer(attempts: ReadonlyMap<string, number>, error: RuntimeError): FixOffer {
  return (attempts.get(errorSignature(error)) ?? 0) >= MAX_FIX_ATTEMPTS ? "exhausted" : "offer";
}

export function withFixAttempt(attempts: ReadonlyMap<string, number>, error: RuntimeError): Map<string, number> {
  const signature = errorSignature(error);
  return new Map(attempts).set(signature, (attempts.get(signature) ?? 0) + 1);
}
