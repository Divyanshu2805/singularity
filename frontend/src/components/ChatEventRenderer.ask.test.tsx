/**
 * Covers answering a question the assistant asked, as rendered: one question is answered by a single click, several
 * are picked and then sent together as labelled lines, and a question on a turn that can no longer be answered shows
 * its suggestions as plain text with nothing to click.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssistantEvents } from "./ChatEventRenderer";
import { ChatEvent, ChatEventType } from "@/lib/types";

const ask = (content: string, metadata?: string): ChatEvent =>
  ({ type: ChatEventType.ASK, content, metadata, isComplete: true });

const renderTurn = (events: ChatEvent[], onAnswer?: (answer: string) => void) =>
  render(<AssistantEvents events={events} isStreaming={false} isIdle onAnswer={onAnswer} />);

describe("answering the assistant's questions", () => {
  it("sends a single question's answer on one click", () => {
    const onAnswer = vi.fn();
    renderTurn([ask("How should orders be shown?", "A table|A set of cards")], onAnswer);

    fireEvent.click(screen.getByRole("button", { name: "A set of cards" }));

    expect(onAnswer).toHaveBeenCalledWith("A set of cards");
  });

  it("collects an answer per question and sends them together, only once every one is answered", () => {
    const onAnswer = vi.fn();
    renderTurn([ask("How should people sign in?", "Email|Google"), ask("Which city is this for?")], onAnswer);

    const send = screen.getByRole("button", { name: /send answers/i });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Google" }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Which city is this for?" }), { target: { value: "Pune" } });
    fireEvent.click(send);

    expect(onAnswer).toHaveBeenCalledWith("How should people sign in: Google\nWhich city is this for: Pune");
  });

  it("shows suggestions as plain text when the turn can no longer be answered", () => {
    renderTurn([ask("How should orders be shown?", "A table|A set of cards")]);

    expect(screen.getByText("How should orders be shown?")).toBeInTheDocument();
    expect(screen.getByText("A table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A table" })).toBeNull();
  });
});
