/**
 * Tests for what a link written by a model may do.
 *
 * Handles: web and mail addresses are accepted and a web link's site is named; script, data and relative addresses,
 * and an address hiding its real site behind a user name, are refused; and a link is only left unlabelled when its
 * own words already name the site.
 */
import { describe, expect, it } from "vitest";
import { safeLink, saysWhereItGoes } from "./safe-link";

describe("safeLink", () => {
  it("accepts a web address and names its site", () => {
    expect(safeLink("https://www.example.com/docs?page=2")).toEqual({
      href: "https://www.example.com/docs?page=2",
      site: "example.com",
    });
    expect(safeLink("http://react.dev")?.site).toBe("react.dev");
  });

  it("accepts a mail address", () => {
    expect(safeLink("mailto:someone@example.com")).toEqual({ href: "mailto:someone@example.com", site: null });
  });

  it("refuses anything that is not a web or mail address", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "file:///etc/passwd", "/projects/1", "#top", "", undefined, null]) {
      expect(safeLink(href)).toBeNull();
    }
  });

  it("refuses an address that hides its site behind a user name", () => {
    expect(safeLink("https://accounts.google.com@evil.example/login")).toBeNull();
  });
});

describe("saysWhereItGoes", () => {
  it("is true only when the words name the site", () => {
    expect(saysWhereItGoes("https://react.dev/learn", "react.dev")).toBe(true);
    expect(saysWhereItGoes("the React.dev guide", "react.dev")).toBe(true);
    expect(saysWhereItGoes("Sign in again to continue", "evil.example")).toBe(false);
    expect(saysWhereItGoes("write to us", null)).toBe(true);
  });
});
