/**
 * Covers what a turn in progress says about itself: the line that reports what the server is doing between pieces of
 * the answer, the clock at its head, and that both give way to the saved record once the turn is done.
 *
 * Reading files, carrying on a reply that stopped early and saving used to look identical from the browser - a bare
 * "Working" - so a turn that was quietly on its second attempt could not be told from one that had hung.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AssistantEvents } from "./ChatEventRenderer";
import { ChatEvent, ChatEventType } from "@/lib/types";

const message = (content: string, isComplete = true): ChatEvent => ({ type: ChatEventType.MESSAGE, content, isComplete });
const file = (path: string, isComplete: boolean): ChatEvent => ({ type: ChatEventType.FILE_EDIT, content: "x", filePath: path, isComplete });

afterEach(() => vi.useRealTimers());

describe("what a turn in progress says it is doing", () => {
  it("shows the server's status line while nothing is arriving", () => {
    render(<AssistantEvents events={[message("On it.")]} isStreaming isIdle={false} status="Reading 6 files" />);

    expect(screen.getByText(/Reading 6 files/)).toBeInTheDocument();
  });

  it("shows it even while a file is being written, since the server knows better than the spinner", () => {
    render(<AssistantEvents events={[file("src/App.tsx", false)]} isStreaming isIdle={false} status="The reply stopped early - writing the 1 file still left" />);

    expect(screen.getByText(/writing the 1 file still left/)).toBeInTheDocument();
  });

  it("falls back to Thinking before anything has arrived and Working after", () => {
    const { rerender } = render(<AssistantEvents events={[]} isStreaming isIdle={false} />);
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();

    rerender(<AssistantEvents events={[message("On it.")]} isStreaming isIdle />);
    expect(screen.getByText(/Working/)).toBeInTheDocument();
  });

  it("says nothing of the kind once the turn is over", () => {
    render(<AssistantEvents events={[message("Done.")]} isStreaming={false} isIdle status="Saving your changes" />);

    expect(screen.queryByText(/Saving your changes/)).toBeNull();
    expect(screen.queryByText(/Working/)).toBeNull();
  });

  it("does not talk over a message that is being typed out", () => {
    render(<AssistantEvents events={[message("Half a sen", false)]} isStreaming isIdle={false} status="Reading 2 files" />);

    expect(screen.queryByText(/Reading 2 files/)).toBeNull();
  });
});

describe("the clock at the head of a turn", () => {
  it("counts how long the turn has been working, a second at a time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T10:00:12Z"));
    render(<AssistantEvents events={[]} isStreaming isIdle={false} startedAt="2026-09-16T10:00:00Z" />);

    expect(screen.getByText(/Working for 12s/)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Working for 15s/)).toBeInTheDocument();
  });

  it("is replaced by the saved line once the turn is recorded", () => {
    const thought: ChatEvent = { type: ChatEventType.THOUGHT, content: "Worked for 39s", metadata: "SAVED" };
    render(<AssistantEvents events={[thought, message("Done.")]} isStreaming={false} isIdle startedAt="2026-09-16T10:00:00Z" />);

    expect(screen.getByText("Worked for 39s")).toBeInTheDocument();
    expect(screen.queryByText(/Working for/)).toBeNull();
  });

  it("is not shown for a turn that is not in progress", () => {
    render(<AssistantEvents events={[message("Done.")]} isStreaming={false} isIdle startedAt="2026-09-16T10:00:00Z" />);

    expect(screen.queryByText(/Working for/)).toBeNull();
  });
});
