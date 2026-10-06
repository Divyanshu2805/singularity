/**
 * Covers the idea interview as a store that outlives the page showing it - the bug being that leaving the dashboard
 * mid-interview threw the questions away and cancelled the request, so coming back showed nothing.
 *
 * In particular: a request that finishes while no page is subscribed is still there to read afterwards, starting again
 * for the same idea resumes rather than refetching, the AI deciding an idea needs no questions or a spent allowance
 * arrives as an outcome for whichever page next asks, a failed AI is reported as not tailored, answers and position
 * survive, a late result for a discarded interview is ignored, and signing out clears it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, api: { ...original.api, clarifyIdea: vi.fn(), compileIdea: vi.fn() } };
});

import { ApiRequestError, api } from "./api";
import {
  MAX_AGE_MS,
  addCustomOption,
  advance,
  clearInterview,
  compileInterview,
  getInterview,
  goBack,
  goToQuestion,
  setSelection,
  startInterview,
} from "./idea-interview";
import { clearSignedInState } from "./session";
import type { ClarifyingQuestion, QuotaDetails } from "./types";

const clarifyIdea = vi.mocked(api.clarifyIdea);
const compileIdea = vi.mocked(api.compileIdea);

const question = (id: string): ClarifyingQuestion => ({ id, question: `${id}?`, helper: null, options: ["One", "Two"], multiSelect: false });
const tailored = (...ids: string[]) => ({ questions: ids.map(question), tailored: true });

const quota: QuotaDetails = { reason: "DAILY_TOKENS", limit: 100, used: 100, planName: "Free" };
const quotaError = () => new ApiRequestError("You've used today's allowance", 402, quota);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  clearInterview();
  clarifyIdea.mockReset();
  compileIdea.mockReset();
});

afterEach(() => clearInterview());

describe("starting and resuming", () => {
  it("is loading until the questions arrive, then holds them", async () => {
    clarifyIdea.mockResolvedValue(tailored("audience", "style"));

    startInterview("a todo app");
    expect(getInterview()).toMatchObject({ idea: "a todo app", isLoading: true, questions: [] });

    await settle();
    expect(getInterview()).toMatchObject({ isLoading: false, isTailored: true, phase: "asking", index: 0 });
    expect(getInterview()?.questions.map((q) => q.id)).toEqual(["audience", "style"]);
  });

  it("keeps a request running with no page watching, so the questions are there on return", async () => {
    let resolve!: (value: ReturnType<typeof tailored>) => void;
    clarifyIdea.mockReturnValue(new Promise((r) => (resolve = r)));

    startInterview("a todo app");
    expect(getInterview()?.isLoading).toBe(true);

    resolve(tailored("layout"));
    await settle();

    expect(getInterview()?.isLoading).toBe(false);
    expect(getInterview()?.questions).toHaveLength(1);
  });

  it("resumes the same idea without asking the AI again, keeping the answers and the position", async () => {
    clarifyIdea.mockResolvedValue(tailored("a", "b", "c"));
    startInterview("a todo app");
    await settle();
    setSelection("a", ["One"]);
    advance();

    startInterview("a todo app");

    expect(clarifyIdea).toHaveBeenCalledTimes(1);
    expect(getInterview()).toMatchObject({ index: 1, selections: { a: ["One"] } });
  });

  it("starts over for a different idea", async () => {
    clarifyIdea.mockResolvedValue(tailored("a"));
    startInterview("a todo app");
    await settle();
    setSelection("a", ["One"]);

    startInterview("a recipe app");

    expect(clarifyIdea).toHaveBeenCalledTimes(2);
    expect(getInterview()).toMatchObject({ idea: "a recipe app", isLoading: true, selections: {} });
  });

  it("ignores a late answer for an interview that was cleared or replaced", async () => {
    let resolveFirst!: (value: ReturnType<typeof tailored>) => void;
    clarifyIdea.mockReturnValueOnce(new Promise((r) => (resolveFirst = r))).mockResolvedValueOnce(tailored("second"));

    startInterview("first idea");
    clearInterview();
    startInterview("second idea");
    await settle();
    resolveFirst(tailored("first"));
    await settle();

    expect(getInterview()?.idea).toBe("second idea");
    expect(getInterview()?.questions.map((q) => q.id)).toEqual(["second"]);
  });
});

describe("what the AI's answer means", () => {
  it("an idea judged to need no questions is an outcome to build straight away", async () => {
    clarifyIdea.mockResolvedValue({ questions: [], tailored: true });

    startInterview("a todo app with a calendar, tags and dark mode for my team");
    await settle();

    expect(getInterview()?.outcome).toEqual({ kind: "build", firstMessage: "a todo app with a calendar, tags and dark mode for my team" });
  });

  it("an AI that could not be reached gives the general questions, flagged as not tailored", async () => {
    clarifyIdea.mockResolvedValue({ questions: [question("fallback")], tailored: false });
    startInterview("a todo app");
    await settle();

    expect(getInterview()).toMatchObject({ isTailored: false, outcome: null });
  });

  it("a failed request falls back to the general questions and says so", async () => {
    clarifyIdea.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    startInterview("a todo app");
    await settle();

    expect(getInterview()?.isTailored).toBe(false);
    expect(getInterview()?.questions.length).toBeGreaterThan(0);
  });

  it("a spent allowance is an outcome, not a failure", async () => {
    clarifyIdea.mockRejectedValue(quotaError());

    startInterview("a todo app");
    await settle();

    expect(getInterview()?.outcome).toEqual({ kind: "quota", quota });
  });
});

describe("answering", () => {
  beforeEach(async () => {
    clarifyIdea.mockResolvedValue(tailored("a", "b", "c"));
    startInterview("a todo app");
    await settle();
  });

  it("moves forward to a review after the last question, and back again", () => {
    advance();
    advance();
    expect(getInterview()).toMatchObject({ index: 2, phase: "asking" });

    advance();
    expect(getInterview()?.phase).toBe("review");

    goBack();
    expect(getInterview()).toMatchObject({ phase: "asking", index: 2 });
  });

  it("editing one answer from the review returns to the review afterwards", () => {
    advance();
    advance();
    advance();

    goToQuestion(0, true);
    expect(getInterview()).toMatchObject({ phase: "asking", index: 0 });

    advance();
    expect(getInterview()).toMatchObject({ phase: "review", returnToReview: false });
  });

  it("keeps a typed-in answer as an extra option once, and the selection with it", () => {
    addCustomOption("a", "Something else");
    addCustomOption("a", "Something else");
    setSelection("a", ["Something else"]);

    expect(getInterview()?.customOptions).toEqual({ a: ["Something else"] });
    expect(getInterview()?.selections).toEqual({ a: ["Something else"] });
  });
});

describe("compiling the brief", () => {
  beforeEach(async () => {
    clarifyIdea.mockResolvedValue(tailored("audience"));
    startInterview("a todo app");
    await settle();
    setSelection("audience", ["Just me"]);
    advance();
  });

  it("sends the answers and ends with the brief as the message to build from", async () => {
    compileIdea.mockResolvedValue("**Build:** a todo app");

    compileInterview();
    expect(getInterview()?.phase).toBe("compiling");
    await settle();

    expect(compileIdea).toHaveBeenCalledWith("a todo app", [{ questionId: "audience", question: "audience?", answers: ["Just me"] }]);
    expect(getInterview()?.outcome).toEqual({ kind: "build", firstMessage: "**Build:** a todo app" });
  });

  it("only compiles once however many times it is asked", async () => {
    compileIdea.mockResolvedValue("brief");

    compileInterview();
    compileInterview();
    await settle();

    expect(compileIdea).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain brief from the person's own words if the AI fails", async () => {
    compileIdea.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    compileInterview();
    await settle();

    const outcome = getInterview()?.outcome;
    expect(outcome?.kind).toBe("build");
    expect(outcome && outcome.kind === "build" ? outcome.firstMessage : "").toContain("a todo app");
    expect(outcome && outcome.kind === "build" ? outcome.firstMessage : "").toContain("Just me");
  });

  it("a spent allowance while compiling is an outcome, and puts the person back on the review", async () => {
    compileIdea.mockRejectedValue(quotaError());

    compileInterview();
    await settle();

    expect(getInterview()).toMatchObject({ phase: "review", outcome: { kind: "quota", quota } });
  });
});

describe("how long it is kept", () => {
  it("is not resurrected after MAX_AGE_MS, and starting again replaces it", async () => {
    clarifyIdea.mockResolvedValue(tailored("a"));
    const start = Date.now();
    startInterview("a todo app", start);
    await settle();

    expect(getInterview(start + MAX_AGE_MS - 1)).not.toBeNull();
    expect(getInterview(start + MAX_AGE_MS + 1)).toBeNull();

    startInterview("a todo app", start + MAX_AGE_MS + 1);
    expect(clarifyIdea).toHaveBeenCalledTimes(2);
  });

  it("is cleared on sign-out", async () => {
    clarifyIdea.mockResolvedValue(tailored("a"));
    startInterview("a todo app");
    await settle();

    clearSignedInState();

    expect(getInterview()).toBeNull();
  });
});
