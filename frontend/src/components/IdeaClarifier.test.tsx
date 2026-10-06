/**
 * Covers the interview as the person experiences it across a page change: answering a question, leaving, and coming
 * back finds the next question rather than an empty prompt; leaving while the questions are still being written still
 * ends with them there; an AI that decided no questions were needed while the page was away builds on return; and
 * the notice for general questions is shown. Unmounting and rendering again stands in for leaving the dashboard for
 * another page and returning to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, clarifyIdea: vi.fn(), compileIdea: vi.fn() } };
});

import { api } from "@/lib/api";
import { clearInterview, startInterview } from "@/lib/idea-interview";
import type { ClarifyingQuestion } from "@/lib/types";
import { IdeaClarifier } from "./IdeaClarifier";

const clarifyIdea = vi.mocked(api.clarifyIdea);

const question = (id: string, text: string): ClarifyingQuestion =>
  ({ id, question: text, helper: null, options: ["Kanban columns", "A plain list"], multiSelect: false });

const questions = [question("layout", "How should tasks be organized?"), question("style", "What should it look like?")];

const handlers = () => ({ onEditIdea: vi.fn(), onComplete: vi.fn(), onQuotaExceeded: vi.fn() });

beforeEach(() => {
  clearInterview();
  clarifyIdea.mockReset();
});

afterEach(() => clearInterview());

describe("leaving the page mid-interview", () => {
  it("returns to the question you were on, with your answer kept, and does not ask the AI again", async () => {
    clarifyIdea.mockResolvedValue({ questions, tailored: true });
    startInterview("a todo app with drag and drop");

    const first = render(<IdeaClarifier {...handlers()} />);
    await screen.findByText("How should tasks be organized?");
    fireEvent.click(screen.getByRole("button", { name: /Kanban columns/ }));
    await screen.findByText("What should it look like?");
    first.unmount();

    startInterview("a todo app with drag and drop");
    render(<IdeaClarifier {...handlers()} />);

    expect(screen.getByText("What should it look like?")).toBeInTheDocument();
    expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
    expect(clarifyIdea).toHaveBeenCalledTimes(1);
  });

  it("shows the questions on return even though they finished arriving while the page was away", async () => {
    let resolve!: (value: { questions: ClarifyingQuestion[]; tailored: boolean }) => void;
    clarifyIdea.mockReturnValue(new Promise((r) => (resolve = r)));
    startInterview("a todo app");

    const first = render(<IdeaClarifier {...handlers()} />);
    expect(screen.getByText(/Reading your idea/)).toBeInTheDocument();
    first.unmount();

    await act(async () => resolve({ questions, tailored: true }));
    render(<IdeaClarifier {...handlers()} />);

    expect(screen.getByText("How should tasks be organized?")).toBeInTheDocument();
    expect(screen.queryByText(/Reading your idea/)).toBeNull();
  });

  it("builds on return when the AI decided, while the page was away, that no questions were needed", async () => {
    clarifyIdea.mockResolvedValue({ questions: [], tailored: true });
    startInterview("a very detailed idea");
    await act(async () => undefined);

    const { onComplete } = handlers();
    render(<IdeaClarifier onEditIdea={vi.fn()} onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("a very detailed idea"));
  });
});

describe("general questions", () => {
  it("says plainly that they are not written for the idea", async () => {
    clarifyIdea.mockResolvedValue({ questions, tailored: false });
    startInterview("a todo app");

    render(<IdeaClarifier {...handlers()} />);

    expect(await screen.findByText(/couldn.t be reached just now/)).toBeInTheDocument();
  });

  it("shows no such notice for questions written for the idea", async () => {
    clarifyIdea.mockResolvedValue({ questions, tailored: true });
    startInterview("a todo app");

    render(<IdeaClarifier {...handlers()} />);
    await screen.findByText("How should tasks be organized?");

    expect(screen.queryByText(/couldn.t be reached just now/)).toBeNull();
  });
});
