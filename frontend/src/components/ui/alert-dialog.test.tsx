/**
 * The confirmation dialog's way out.
 *
 * Handles: pressing outside the box closing the dialog - for one the caller controls and for one it does not - and
 * pressing inside it doing nothing of the kind.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";

const overlay = () => document.querySelector<HTMLElement>("div.fixed.inset-0")!;

function Controlled({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete it?</AlertDialogTitle>
        <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Delete</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("closes when the overlay is pressed, and not when the box is", () => {
    const onClose = vi.fn();
    render(<Controlled onClose={onClose} />);

    fireEvent.click(screen.getByText("Delete it?"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Delete it?")).toBeNull();
  });

  it("closes on a whole press of the overlay - pointer down, up and click, as a browser sends them", () => {
    const onClose = vi.fn();
    render(<Controlled onClose={onClose} />);

    for (const press of [fireEvent.pointerDown, fireEvent.mouseDown, fireEvent.pointerUp, fireEvent.mouseUp, fireEvent.click]) {
      press(overlay());
    }

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes one it keeps the state of itself", () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Sure?</AlertDialogTitle>
          <AlertDialogDescription>Really.</AlertDialogDescription>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>,
    );

    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Sure?")).toBeTruthy();

    fireEvent.click(overlay());
    expect(screen.queryByText("Sure?")).toBeNull();
  });
});
