/**
 * The first-run guide to a project's page: what its pointers say and where each one stands.
 *
 * Handles: the steps in order - the chat, the preview, the code, the history, and publishing where the page has it -
 * each tied to the part of the page it points at by a data-guide attribute; leaving out a step whose part is not on
 * the page; remembering, per person and per browser, that the guide has been seen; and placing the pointer's card
 * beside its target without letting it run off the window.
 *
 * A step is looked up by attribute rather than passed a component, so the guide knows nothing about the page's
 * layout and a part that is added later (the Publish button) joins the guide by carrying the attribute. Whether the
 * guide has been seen is a preference of the person on this browser, keyed by their id, and holds nothing about any
 * project - so it is kept in localStorage and is not one of the stores that sign-out clears.
 */

export interface GuideStep {
  anchor: string;
  title: string;
  body: string;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    anchor: "chat",
    title: "Ask for what you want",
    body: "Describe a change in your own words, the way you would tell a person. Singularity writes the code and tells you what it did.",
  },
  {
    anchor: "preview",
    title: "See it running",
    body: "Preview opens your app as a real page you can click around in. After each change it updates by itself.",
  },
  {
    anchor: "code",
    title: "Look inside",
    body: "Code shows every file that was written. Select any lines and press Explain to learn what they do, or press the pencil to change a line yourself.",
  },
  {
    anchor: "history",
    title: "Nothing is ever lost",
    body: "History keeps every saved change, and you can go back to any of them. Undo under a reply takes back just that one change.",
  },
  {
    anchor: "publish",
    title: "Share what you made",
    body: "Publish puts your app at a link anyone can open, with no account needed.",
  },
];

export const guideAnchorSelector = (anchor: string) => `[data-guide="${anchor}"]`;

export function availableSteps(isOnPage: (anchor: string) => boolean): GuideStep[] {
  return GUIDE_STEPS.filter((step) => isOnPage(step.anchor));
}

const seenKey = (userId: number | string | null | undefined) => `workspace_guide_seen_${userId ?? "anon"}`;

export function hasSeenGuide(userId: number | string | null | undefined): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function markGuideSeen(userId: number | string | null | undefined) {
  try {
    localStorage.setItem(seenKey(userId), "1");
  } catch {
  }
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CardPlacement {
  top: number;
  left: number;
  above: boolean;
}

const GAP = 12;
const EDGE = 12;

/** Below its target and centred on it when there is room, above it when there is not, and always inside the window. */
export function placeCard(target: Box, card: { width: number; height: number }, viewport: { width: number; height: number }): CardPlacement {
  const fitsBelow = target.top + target.height + GAP + card.height <= viewport.height - EDGE;
  const fitsAbove = target.top - GAP - card.height >= EDGE;
  const above = !fitsBelow && fitsAbove;
  const wantedTop = above ? target.top - GAP - card.height : target.top + target.height + GAP;
  const wantedLeft = target.left + target.width / 2 - card.width / 2;
  return {
    top: Math.max(EDGE, Math.min(wantedTop, viewport.height - EDGE - card.height)),
    left: Math.max(EDGE, Math.min(wantedLeft, viewport.width - EDGE - card.width)),
    above,
  };
}
