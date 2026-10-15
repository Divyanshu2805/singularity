/**
 * Covers what an empty chat window says: a conversation that could not be fetched shows the failure with Try again,
 * never the "What should we build?" a new project opens on.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChatPanel } from "./ChatPanel";

const panel = (loadError?: Parameters<typeof ChatPanel>[0]["loadError"]) =>
  render(
    <MemoryRouter>
      <ChatPanel messages={[]} onSendMessage={() => {}} isStreaming={false} loadError={loadError} />
    </MemoryRouter>,
  );

describe("ChatPanel", () => {
  it("opens an empty conversation on the build prompt", () => {
    panel();
    expect(screen.getByText(/What should we/)).toBeInTheDocument();
  });

  it("shows a history that failed to load as a failure, with Try again", () => {
    const onRetry = vi.fn();
    panel({ message: "Failed to fetch", onRetry, isRetrying: false, attempt: 1 });

    expect(screen.queryByText(/What should we/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the conversation");
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says it is trying while the retry runs", () => {
    panel({ message: "Failed to fetch", onRetry: () => {}, isRetrying: true, attempt: 2 });
    expect(screen.getByRole("button", { name: /Trying again/ })).toBeDisabled();
  });
});
