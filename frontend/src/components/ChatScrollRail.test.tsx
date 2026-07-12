import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatScrollRail } from "./ChatScrollRail";
import { MAX_RAIL_TICKS, messageLabel } from "@/lib/chat-rail";

const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `m${index}`, label: `Message ${index + 1}` }));

describe("messageLabel", () => {
  it("uses the first meaningful line without markdown markers", () => {
    expect(messageLabel("\n# **Build**: a kanban board\n\nwith columns")).toBe("Build: a kanban board");
    expect(messageLabel("- fix the `navbar` spacing")).toBe("fix the navbar spacing");
  });

  it("keeps a label short and never empty", () => {
    // Capped with an ellipsis - the row glides the rest into view, but a whole paragraph would glide forever.
    expect(messageLabel("x".repeat(300))).toHaveLength(121);
    expect(messageLabel("   \n  ")).toBe("Message");
  });
});

describe("ChatScrollRail", () => {
  it("draws one tick per message, with the current one marked in the list", () => {
    const { container } = render(<ChatScrollRail items={items(4)} activeIndex={2} onSelect={() => {}} />);

    expect(container.querySelectorAll("[data-rail-tick]")).toHaveLength(4);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Jump to one of your messages" }).parentElement!);

    const current = screen.getByRole("menuitem", { name: "Message 3" });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  });

  it("shows a long label whole, for the row to glide through rather than cutting it off", () => {
    const long = "Build: A private plain-text notes app with nested folders and localStorage";
    render(<ChatScrollRail items={[{ id: "m0", label: long }]} activeIndex={0} onSelect={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Jump to one of your messages" }));

    // The whole label is in the DOM - it's masked at the row's edge and slid into view on hover, not truncated
    // to a shorter string, which is what lets a long brief still be read from the list.
    expect(screen.getByRole("menuitem", { name: long })).toBeInTheDocument();
  });

  it("jumps to the picked message and closes the list", () => {
    const onSelect = vi.fn();
    render(<ChatScrollRail items={items(3)} activeIndex={0} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Jump to one of your messages" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Message 2" }));

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows a window of ticks for a long chat but every message in the list", () => {
    const { container } = render(<ChatScrollRail items={items(40)} activeIndex={30} onSelect={() => {}} />);

    expect(container.querySelectorAll("[data-rail-tick]")).toHaveLength(MAX_RAIL_TICKS);
    fireEvent.click(screen.getByRole("button", { name: "Jump to one of your messages" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(40);
  });
});
