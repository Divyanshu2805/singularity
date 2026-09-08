/**
 * Covers the test-mode flag's parsing: only the word "true" (in any case, with stray whitespace) turns the notice on,
 * and an unset, empty or unrecognised value leaves it off rather than guessing.
 */
import { describe, it, expect } from "vitest";
import { isPaymentsTestMode, TEST_CARD_NUMBER } from "./payments-mode";

describe("isPaymentsTestMode", () => {
  it("is on for the word true, however it is cased or padded", () => {
    expect(isPaymentsTestMode("true")).toBe(true);
    expect(isPaymentsTestMode("TRUE")).toBe(true);
    expect(isPaymentsTestMode("  True ")).toBe(true);
  });

  it("is off when unset or empty", () => {
    expect(isPaymentsTestMode(undefined)).toBe(false);
    expect(isPaymentsTestMode("")).toBe(false);
  });

  it("is off for anything that is not the word true, rather than treating it as truthy", () => {
    expect(isPaymentsTestMode("false")).toBe(false);
    expect(isPaymentsTestMode("1")).toBe(false);
    expect(isPaymentsTestMode("yes")).toBe(false);
    expect(isPaymentsTestMode("tru")).toBe(false);
  });
});

describe("TEST_CARD_NUMBER", () => {
  it("is Stripe's standard successful test card", () => {
    expect(TEST_CARD_NUMBER).toBe("4242 4242 4242 4242");
  });
});
