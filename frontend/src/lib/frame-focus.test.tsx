/**
 * Covers lib/frame-focus.ts with the app's real popover and dropdown menu: a press in a frame, which the app's
 * document never hears, closes an open menu; the window losing focus for any other reason does not.
 *
 * Handles: an open popover closing once a frame on the page takes focus; an open dropdown menu doing the same; and a
 * popover staying open when the window loses focus with nothing in a frame focused - another tab, say.
 *
 * A press in a real cross-origin frame fires no event in the app's document, focus events included: the window loses
 * focus and the frame is the active element, and that is all. So the frame is made the active element here by hand
 * rather than focused, since focusing it in this test document would fire a focus event that closes a menu by itself
 * and hide whether the fix did anything.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { closeMenusWhenAFrameTakesFocus } from "./frame-focus";

describe("closeMenusWhenAFrameTakesFocus", () => {
  let stop: () => void = () => {};
  beforeEach(() => {
    stop = closeMenusWhenAFrameTakesFocus();
  });
  afterEach(() => stop());

  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

  const pressInTheFrame = async () => {
    const frame = screen.getByTitle("Live preview");
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => frame });
    try {
      act(() => {
        window.dispatchEvent(new Event("blur"));
      });
      await settle();
    } finally {
      delete (document as unknown as { activeElement?: Element }).activeElement;
    }
  };

  it("closes an open popover when a press lands in a frame", async () => {
    render(
      <>
        <Popover>
          <PopoverTrigger>GitHub</PopoverTrigger>
          <PopoverContent>Not on GitHub yet</PopoverContent>
        </Popover>
        <iframe title="Live preview" />
      </>
    );
    fireEvent.click(screen.getByText("GitHub"));
    await settle();
    expect(screen.getByText("Not on GitHub yet")).toBeInTheDocument();

    await pressInTheFrame();

    await waitFor(() => expect(screen.queryByText("Not on GitHub yet")).not.toBeInTheDocument());
  });

  it("closes an open dropdown menu the same way", async () => {
    render(
      <>
        <DropdownMenu>
          <DropdownMenuTrigger>Mode</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Teach me</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <iframe title="Live preview" />
      </>
    );
    fireEvent.keyDown(screen.getByText("Mode"), { key: "Enter" });
    await settle();
    expect(screen.getByText("Teach me")).toBeInTheDocument();

    await pressInTheFrame();

    await waitFor(() => expect(screen.queryByText("Teach me")).not.toBeInTheDocument());
  });

  it("leaves a menu open when the window loses focus to something other than a frame", async () => {
    render(
      <>
        <Popover>
          <PopoverTrigger>GitHub</PopoverTrigger>
          <PopoverContent>Not on GitHub yet</PopoverContent>
        </Popover>
        <iframe title="Live preview" />
      </>
    );
    fireEvent.click(screen.getByText("GitHub"));
    await settle();

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await settle();

    expect(screen.getByText("Not on GitHub yet")).toBeInTheDocument();
  });
});
