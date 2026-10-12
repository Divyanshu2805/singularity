/**
 * Covers the account menu's three pages: their order, and that the sidebar marks Account as current on each of them
 * and on no other address.
 */
import { describe, expect, it } from "vitest";
import { ACCOUNT_PAGES, isAccountPath } from "./account-pages";

describe("the account pages", () => {
  it("are Profile, Plans & billing and Security, in that order", () => {
    expect(ACCOUNT_PAGES.map((page) => page.label)).toEqual(["Profile", "Plans & billing", "Security"]);
  });

  it("are recognised by address, and nothing else is", () => {
    expect(isAccountPath("/account")).toBe(true);
    expect(isAccountPath("/settings/billing")).toBe(true);
    expect(isAccountPath("/settings/security")).toBe(true);
    expect(isAccountPath("/settings")).toBe(false);
    expect(isAccountPath("/projects")).toBe(false);
  });
});
