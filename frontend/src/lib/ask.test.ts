/**
 * Covers the questions a turn can put to the user: reading the suggested answers, collecting a turn's questions once
 * they have fully arrived, and writing the user's picks as the message sent back - a bare answer for one question,
 * labelled lines for several.
 */
import { describe, expect, it } from "vitest";
import { askedQuestions, formatAnswers, isFullyAnswered, parseAnswerOptions } from "./ask";
import { ChatEventType, type ChatEvent } from "./types";

const ask = (content: string, metadata?: string, isComplete = true): ChatEvent =>
  ({ type: ChatEventType.ASK, content, metadata, isComplete });

describe("parseAnswerOptions", () => {
  it("splits on the separator, trimming and dropping blanks and repeats", () => {
    expect(parseAnswerOptions(" A table | A set of cards ||A table")).toEqual(["A table", "A set of cards"]);
  });

  it("is empty for a question with no suggestions", () => {
    expect(parseAnswerOptions(undefined)).toEqual([]);
    expect(parseAnswerOptions("")).toEqual([]);
  });
});

describe("askedQuestions", () => {
  it("collects every question of a turn, in order, ignoring other events", () => {
    const events: ChatEvent[] = [
      { type: ChatEventType.MESSAGE, content: "I need two things first." },
      ask("How should people sign in?", "Email|Google"),
      ask("Which city is this for?"),
    ];

    expect(askedQuestions(events)).toEqual([
      { question: "How should people sign in?", options: ["Email", "Google"] },
      { question: "Which city is this for?", options: [] },
    ]);
  });

  it("leaves out a question that is still arriving", () => {
    expect(askedQuestions([ask("How should peo", undefined, false)])).toEqual([]);
  });
});

describe("formatAnswers", () => {
  const one = [{ question: "How should people sign in?", options: ["Email", "Google"] }];
  const two = [...one, { question: "Which city is this for?", options: [] }];

  it("answers a single question with the bare answer", () => {
    expect(formatAnswers(one, { 0: "Google" })).toBe("Google");
  });

  it("labels each answer when there are several questions", () => {
    expect(formatAnswers(two, { 0: "Google", 1: " Pune " })).toBe(
      "How should people sign in: Google\nWhich city is this for: Pune"
    );
  });

  it("leaves out a question that was not answered", () => {
    expect(formatAnswers(two, { 1: "Pune" })).toBe("Which city is this for: Pune");
    expect(formatAnswers(two, {})).toBe("");
  });
});

describe("isFullyAnswered", () => {
  const two = [
    { question: "One?", options: [] },
    { question: "Two?", options: [] },
  ];

  it("needs an answer to every question", () => {
    expect(isFullyAnswered(two, { 0: "a" })).toBe(false);
    expect(isFullyAnswered(two, { 0: "a", 1: " " })).toBe(false);
    expect(isFullyAnswered(two, { 0: "a", 1: "b" })).toBe(true);
    expect(isFullyAnswered([], {})).toBe(false);
  });
});
