/**
 * The questions an assistant turn can put to the user, as the chat talks about them.
 *
 * Handles: reading the suggested answers off an ask event, collecting every question a turn asked, and turning the
 * user's picks into the message that is sent back as their answer.
 *
 * The suggested answers travel as one pipe-separated string in the event's metadata - the same separator the backend
 * parser joins them with (LlmResponseParser.ANSWER_OPTION_SEPARATOR) - so the two must change together. A single
 * question is answered with the bare answer, which reads like something a person would type; several questions are
 * answered as "question: answer" lines, because a list of bare answers would leave the model guessing which is which.
 */
import { ChatEvent, ChatEventType } from "./types";

export const ANSWER_OPTION_SEPARATOR = "|";

export interface AskedQuestion {
  question: string;
  options: string[];
}

export function parseAnswerOptions(metadata: string | undefined | null): string[] {
  if (!metadata) return [];
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of metadata.split(ANSWER_OPTION_SEPARATOR)) {
    const option = raw.trim();
    if (option && !seen.has(option)) {
      seen.add(option);
      options.push(option);
    }
  }
  return options;
}

export function askedQuestions(events: readonly ChatEvent[]): AskedQuestion[] {
  return events
    .filter((event) => event.type === ChatEventType.ASK && event.content.trim() && event.isComplete !== false)
    .map((event) => ({ question: event.content.trim(), options: parseAnswerOptions(event.metadata) }));
}

export function isFullyAnswered(questions: readonly AskedQuestion[], answers: Readonly<Record<number, string>>): boolean {
  return questions.length > 0 && questions.every((_, index) => !!answers[index]?.trim());
}

export function formatAnswers(questions: readonly AskedQuestion[], answers: Readonly<Record<number, string>>): string {
  const answered = questions
    .map((question, index) => ({ question: question.question, answer: answers[index]?.trim() ?? "" }))
    .filter((entry) => entry.answer);
  if (answered.length === 0) return "";
  if (questions.length === 1) return answered[0].answer;
  return answered.map((entry) => `${entry.question.replace(/[?:\s]+$/, "")}: ${entry.answer}`).join("\n");
}
