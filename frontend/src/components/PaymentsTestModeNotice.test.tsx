/**
 * Covers the notice's two states: absent when the deployment is not in test mode, and, when it is, naming the test
 * card and saying no real money moves.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentsTestModeNotice } from "./PaymentsTestModeNotice";

describe("PaymentsTestModeNotice", () => {
  it("renders nothing when test mode is off", () => {
    const { container } = render(<PaymentsTestModeNotice enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the test card and says no real money moves when test mode is on", () => {
    render(<PaymentsTestModeNotice enabled />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Payments are in Stripe test mode");
    expect(note).toHaveTextContent("4242 4242 4242 4242");
    expect(note).toHaveTextContent("No real money moves");
  });
});
