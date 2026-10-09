/**
 * The words for every place the build chat can stop a person: what happened, and the one thing to do next.
 *
 * Handles: the line under a reply that did not end as a finished build - stopped, not sent, cut short by the
 * allowance, short of its plan, not saved, failed - and the banner that replaces the composer when today's allowance
 * is spent or too little of it is left for another build.
 *
 * Each sentence answers two questions a beginner has at that moment: are my files all right, and what do I press.
 * They were once fragments ("Part of this plan wasn't written.") that answered neither. Kept here, away from the
 * components, so the whole set can be read and tested side by side, and so "tokens" - a word that means nothing to
 * someone who has not used an AI API - stays out of the sentences a person has to act on.
 */
import type { TurnOutcome } from "./types";

export interface EndedTurn {
  outcome?: TurnOutcome;
  wasStopped?: boolean;
  notSent?: boolean;
}

export function turnEndNote(turn: EndedTurn): string {
  if (turn.wasStopped || turn.outcome === "STOPPED") {
    return "You stopped this answer, so nothing was changed. Press Retry to send it again.";
  }
  if (turn.notSent) {
    return "Your message wasn't sent. Press Retry, or use Edit on it to change it first.";
  }
  switch (turn.outcome) {
    case "OUT_OF_BUDGET":
      return "Today's AI allowance ran out before this finished. What it had written is saved - ask for the rest once the allowance refills.";
    case "INCOMPLETE":
      return "Part of this plan wasn't written. What was written is saved - press Retry to ask for the rest.";
    case "NOT_SAVED":
      return "These changes couldn't be saved, so your files are as they were. Press Retry.";
    default:
      return "This answer didn't finish, so nothing was changed. Press Retry.";
  }
}

export interface QuotaStop {
  title: string;
  detail: string;
}

export function quotaStop(quota: { isExhausted: boolean; canBuild: boolean }, resetsIn: string): QuotaStop | null {
  if (!quota.isExhausted && quota.canBuild) return null;
  return {
    title: quota.isExhausted
      ? "You've used all of today's AI allowance."
      : "There isn't enough of today's AI allowance left for another build.",
    detail: `It refills in ${resetsIn}. Until then you can still read and edit your code, use the preview and go back through History.`,
  };
}
