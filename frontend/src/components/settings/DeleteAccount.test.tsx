/**
 * Covers the first step of deleting an account: the warning lists what goes, Continue stays off until DELETE is typed
 * exactly, and only then is the person asked to sign in again - nothing is deleted before that.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const deleteAccount = vi.fn();

vi.mock("@/lib/firebase-auth", () => ({
  deleteAccount: (...args: unknown[]) => deleteAccount(...args),
  releaseFirebaseUser: vi.fn(),
}));

vi.mock("@/components/settings/SecuritySections", () => ({
  ConfirmIdentityDialog: ({ open, purpose }: { open: boolean; purpose: string }) =>
    open ? <div role="dialog" aria-label="confirm identity">Sign in again {purpose}</div> : null,
}));

import { DeleteAccount } from "./DeleteAccount";

describe("DeleteAccount", () => {
  it("asks for DELETE to be typed before asking the person to sign in again", () => {
    render(<DeleteAccount />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(screen.getByText(/every project you own/i)).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: "delete" } });
    expect(go).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: "DELETE" } });
    expect(go).toBeEnabled();
    fireEvent.click(go);

    expect(screen.getByRole("dialog", { name: "confirm identity" })).toHaveTextContent("to delete your account");
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
