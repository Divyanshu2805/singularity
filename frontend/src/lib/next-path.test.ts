import { describe, expect, it } from "vitest";
import { loginWithNext, safeNextPath } from "./next-path";

describe("where to go after signing in", () => {
  it("accepts this app's own pages a person may have come from", () => {
    expect(safeNextPath("/p/my-app-ab12")).toBe("/p/my-app-ab12");
    expect(safeNextPath("/projects")).toBe("/projects");
    expect(safeNextPath("/projects/42")).toBe("/projects/42");
  });

  it("drops anything else, including every shape of open redirect", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/p/../admin",
      "/p/UPPER", "/p/a b", "/p/a/b", "/projects/abc", "/projects/1/extra", "/login", "", "p/x", "/p/-bad", "/p/bad-"]) {
      expect(safeNextPath(bad), bad).toBeNull();
    }
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it("builds the sign-in address that carries the page, encoded", () => {
    expect(loginWithNext("/p/my-app-ab12")).toBe("/login?next=%2Fp%2Fmy-app-ab12");
    expect(loginWithNext("/p/my-app-ab12", "signup")).toBe("/signup?next=%2Fp%2Fmy-app-ab12");
  });
});
