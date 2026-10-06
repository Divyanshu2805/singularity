/**
 * The idea interview in progress, kept outside the page that shows it.
 *
 * Handles: starting an interview for an idea, holding its questions, the answers given so far and where the person is
 * in it, running the two AI requests it needs (the questions, then the brief compiled from the answers) to completion
 * whether or not the page is still on screen, and handing the result - a message to build from, or a spent allowance -
 * to whichever page next asks for it.
 *
 * It lives in module state rather than in the component because the interview used to be component state on the
 * dashboard: leaving for another page unmounted it, discarded the questions and cancelled the request still being
 * answered, so coming back showed an empty prompt and the tokens spent on the questions were wasted. Starting again for
 * the same idea resumes what is there. It is kept for MAX_AGE_MS only, so a forgotten one is not resurrected hours
 * later, it is lost on a full page reload, and it registers its own reset with the session module, as every
 * module-level store holding user state must.
 *
 * The general questions are only ever a fallback for an AI that could not be reached, and the interview reports that
 * they are not tailored (isTailored) so the page can say so.
 */
import { useSyncExternalStore } from "react";
import { api, isQuotaError } from "./api";
import { onSignOut } from "./session";
import type { ClarifyingQuestion, IdeaAnswer, QuotaDetails } from "./types";

export const MAX_AGE_MS = 30 * 60 * 1000;

export type InterviewPhase = "asking" | "review" | "compiling";

export type InterviewOutcome =
  | { kind: "build"; firstMessage: string }
  | { kind: "quota"; quota: QuotaDetails };

export interface Interview {
  /** Tells one interview from the next, so a late answer for a discarded one cannot land on its replacement. */
  id: number;
  idea: string;
  startedAt: number;
  isLoading: boolean;
  questions: ClarifyingQuestion[];
  isTailored: boolean;
  phase: InterviewPhase;
  index: number;
  returnToReview: boolean;
  selections: Record<string, string[]>;
  customOptions: Record<string, string[]>;
  outcome: InterviewOutcome | null;
}

const GENERAL_QUESTIONS: ClarifyingQuestion[] = [
  {
    id: "audience",
    question: "Who is this for?",
    helper: "Knowing your users shapes every screen.",
    options: ["Just me", "My customers", "My team at work", "Students or learners", "The general public"],
    multiSelect: false,
  },
  {
    id: "core_action",
    question: "What's the one thing people must be able to do?",
    helper: "Everything else gets built around this.",
    options: ["Create and manage items", "Browse and search content", "Track progress over time", "Book or buy something", "Share with others"],
    multiSelect: false,
  },
  {
    id: "screens",
    question: "Which screens does it need?",
    helper: "Pick any that apply. You can always add more later.",
    options: ["Landing page", "Dashboard", "List or feed", "Detail page", "Settings", "Sign in"],
    multiSelect: true,
  },
  {
    id: "style",
    question: "What should it feel like?",
    helper: "A style reference helps the design land the first time.",
    options: ["Clean and minimal", "Bold and colorful", "Dark and techy", "Playful and friendly", "Like Notion", "Like Stripe"],
    multiSelect: false,
  },
];

function localBrief(idea: string, answers: IdeaAnswer[]) {
  const answered = answers.filter((answer) => answer.answers.length > 0);
  const details = answered
    .map((answer) => `\n- ${answer.question.trim().replace(/[?:\s]+$/, "")}: ${answer.answers.join(", ")}`)
    .join("");
  return `**Build:** ${idea}${details ? `\n\n**Details:**${details}` : ""}`;
}

let current: Interview | null = null;
let lastId = 0;
const listeners = new Set<() => void>();

function publish(next: Interview | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function update(id: number, patch: Partial<Interview>) {
  if (current && current.id === id) publish({ ...current, ...patch });
}

const isFresh = (interview: Interview, now: number) => now - interview.startedAt <= MAX_AGE_MS;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function getInterview(now = Date.now()): Interview | null {
  return current && isFresh(current, now) ? current : null;
}

export const useInterview = () => useSyncExternalStore(subscribe, () => getInterview());

export function answersOf(interview: Interview): IdeaAnswer[] {
  return interview.questions.map((q) => ({ questionId: q.id, question: q.question, answers: interview.selections[q.id] ?? [] }));
}

export function startInterview(idea: string, now = Date.now()) {
  if (current && current.idea === idea && isFresh(current, now)) return;
  const id = ++lastId;
  publish({
    id,
    idea,
    startedAt: now,
    isLoading: true,
    questions: [],
    isTailored: true,
    phase: "asking",
    index: 0,
    returnToReview: false,
    selections: {},
    customOptions: {},
    outcome: null,
  });
  void loadQuestions(idea, id);
}

async function loadQuestions(idea: string, id: number) {
  try {
    const interview = await api.clarifyIdea(idea);
    if (interview.tailored && interview.questions.length === 0) {
      update(id, { isLoading: false, outcome: { kind: "build", firstMessage: idea } });
      return;
    }
    const isTailored = interview.tailored && interview.questions.length > 0;
    update(id, {
      isLoading: false,
      isTailored,
      questions: interview.questions.length > 0 ? interview.questions : GENERAL_QUESTIONS,
    });
  } catch (error) {
    if (isQuotaError(error) && error.quota) {
      update(id, { isLoading: false, outcome: { kind: "quota", quota: error.quota } });
      return;
    }
    console.warn("Couldn't get tailored questions, using general ones", error);
    update(id, { isLoading: false, isTailored: false, questions: GENERAL_QUESTIONS });
  }
}

export function clearInterview() {
  if (current) publish(null);
}

export function goToQuestion(target: number, fromReview = false) {
  if (!current) return;
  publish({ ...current, index: target, phase: "asking", returnToReview: fromReview });
}

export function advance() {
  if (!current) return;
  if (current.returnToReview || current.index >= current.questions.length - 1) {
    publish({ ...current, phase: "review", returnToReview: false });
    return;
  }
  publish({ ...current, index: current.index + 1 });
}

export function goBack() {
  if (!current) return;
  if (current.phase === "review") goToQuestion(current.questions.length - 1);
  else if (current.index > 0) goToQuestion(current.index - 1);
}

export function setSelection(questionId: string, selection: string[]) {
  if (!current) return;
  publish({ ...current, selections: { ...current.selections, [questionId]: selection } });
}

export function addCustomOption(questionId: string, text: string) {
  if (!current) return;
  const existing = current.customOptions[questionId] ?? [];
  if (existing.includes(text)) return;
  publish({ ...current, customOptions: { ...current.customOptions, [questionId]: [...existing, text] } });
}

export function compileInterview() {
  if (!current || current.phase === "compiling") return;
  const { idea, id } = current;
  const answers = answersOf(current);
  publish({ ...current, phase: "compiling" });
  void (async () => {
    try {
      update(id, { outcome: { kind: "build", firstMessage: await api.compileIdea(idea, answers) } });
    } catch (error) {
      if (isQuotaError(error) && error.quota) {
        update(id, { phase: "review", outcome: { kind: "quota", quota: error.quota } });
        return;
      }
      console.warn("Couldn't compile the brief on the server, using a simple one", error);
      update(id, { outcome: { kind: "build", firstMessage: localBrief(idea, answers) } });
    }
  })();
}


onSignOut(clearInterview);
