/**
 * Covers the browser half of session security: reading the CSRF token cookie among others, sending it on writes only,
 * sending same-origin credentials and never a bearer token for a cookie session, and re-fetching the token and
 * retrying once when the server rejects it as stale.
 *
 * Also covers the sign-in hint: counted as signed in until the cookie's expiry with no token in storage, and an
 * expired hint reading as signed out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy } from "../../csp";
import { CSRF_HEADER, needsCsrf, readCsrfToken } from "./csrf";
import { friendlyFirebaseError } from "./firebase";
import { api, isAuthenticated, loginRedirectPath, startSession } from "./api";

describe("csrf", () => {
  it("reads the token cookie among others, decoded", () => {
    expect(readCsrfToken("a=1; XSRF-TOKEN=abc%3D123; b=2")).toBe("abc=123");
    expect(readCsrfToken("a=1")).toBeNull();
  });

  it("only writes need a token", () => {
    expect(needsCsrf("GET")).toBe(false);
    expect(needsCsrf(undefined)).toBe(false);
    expect(needsCsrf("post")).toBe(true);
    expect(needsCsrf("DELETE")).toBe(true);
  });
});

describe("api writes", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token-1; path=/";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("send the CSRF header and same-origin credentials, but never a Bearer token for a cookie session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1, username: "a@b.co", name: "A" }, expiresAt: "2999-01-01T00:00:00Z", newAccount: false, secondFactorUsed: true }), { status: 200 })
    );

    await api.createSession("id-token");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get(CSRF_HEADER)).toBe("token-1");
    expect(headers.get("Authorization")).toBeNull();
    expect(init?.credentials).toBe("same-origin");
  });

  it("re-fetch the token and retry once when the server rejects it as stale", async () => {
    const rejected = () => new Response(JSON.stringify({ message: "Your request couldn't be verified. Refresh the page and try again." }), { status: 403 });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await api.signOutEverywhere();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/auth/csrf");
  });
});

describe("session hint", () => {
  beforeEach(() => localStorage.clear());

  it("counts as signed in until the cookie's expiry, without any token in storage", () => {
    startSession({ user: { id: 1, username: "a@b.co", name: "A" }, expiresAt: new Date(Date.now() + 60_000).toISOString(), newAccount: false, secondFactorUsed: false });

    expect(isAuthenticated()).toBe(true);
    expect(JSON.stringify(localStorage)).not.toMatch(/eyJ/);
  });

  it("an expired hint is signed out, and says the session lapsed", () => {
    localStorage.setItem("session_expires_at", new Date(Date.now() - 1000).toISOString());
    localStorage.setItem("user_info", JSON.stringify({ id: 1, username: "a@b.co", name: "A" }));

    expect(isAuthenticated()).toBe(false);
    expect(loginRedirectPath()).toBe("/login?expired=1");
  });
});

describe("content security policy", () => {
  it("allows Firebase, the configured API and preview origins, and nothing inline for scripts", () => {
    const csp = buildContentSecurityPolicy({
      VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
      VITE_API_BASE_URL: "https://api.example.com/base",
      VITE_CSP_FRAME_ORIGINS: "https://preview.example.com",
    });
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

    expect(directive("script-src")).not.toContain("unsafe-inline");
    expect(directive("script-src")).not.toContain("unsafe-eval");
    expect(directive("connect-src")).toContain("https://api.example.com");
    expect(directive("frame-src")).toContain("https://demo.firebaseapp.com");
    expect(directive("frame-src")).toContain("https://preview.example.com");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(csp).not.toMatch(/\s{2,}/);
  });
});

describe("friendlyFirebaseError", () => {
  it("never distinguishes a wrong password from an unknown account", () => {
    const wrong = friendlyFirebaseError({ code: "auth/wrong-password" }, "x");
    expect(friendlyFirebaseError({ code: "auth/user-not-found" }, "x")).toBe(wrong);
    expect(friendlyFirebaseError({ code: "auth/invalid-credential" }, "x")).toBe(wrong);
  });

  it("names an unknown code alongside the fallback, so it can still be diagnosed", () => {
    expect(friendlyFirebaseError({ code: "auth/something-new" }, "fallback")).toBe("fallback (auth/something-new)");
  });

  it("shows a backend failure's own message rather than the provider fallback", () => {
    const backendFailure = Object.assign(new Error("You've used today's AI allowance."), { code: undefined });
    expect(friendlyFirebaseError(backendFailure, "Couldn't sign you in with Google.")).toBe(
      "You've used today's AI allowance."
    );
  });

  it("falls back when there is no message and no code to report", () => {
    expect(friendlyFirebaseError({}, "fallback")).toBe("fallback");
  });
});
