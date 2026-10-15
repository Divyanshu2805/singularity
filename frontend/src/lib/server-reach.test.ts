/**
 * Covers telling "nobody answered" from "the server answered with an error", and the shared flag the whole-page
 * screen reads: set by a request that got no answer, by any 5xx to a GET and by a non-JSON 5xx to a write, cleared by
 * any answer, left alone by the backend's own JSON error to a write (a full runner pool is a 503), and told to
 * subscribers only when it changes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { askAgain, isNobodyAnswering, isServerUnreachable, reportAnswer, resetReach, subscribeToReach } from "./server-reach";

function respondWith(response: (url?: unknown) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetReach();
});

describe("isNobodyAnswering", () => {
  it("is any 5xx to a GET, and a 5xx to a write only when it is not the backend's JSON", () => {
    expect(isNobodyAnswering(502, "text/html")).toBe(true);
    expect(isNobodyAnswering(500, null)).toBe(true);
    expect(isNobodyAnswering(503, "application/json")).toBe(true);
    expect(isNobodyAnswering(503, "application/json", "POST")).toBe(false);
    expect(isNobodyAnswering(502, "text/html", "POST")).toBe(true);
    expect(isNobodyAnswering(404, "text/html")).toBe(false);
    expect(isNobodyAnswering(200, null)).toBe(false);
  });
});

describe("the reach flag", () => {
  it("tells subscribers only when it changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToReach(listener);

    reportAnswer("/api/projects", true);
    reportAnswer("/api/projects/1", true);
    reportAnswer("/api/projects", false);
    reportAnswer("/api/projects/1", false);
    unsubscribe();
    reportAnswer("/api/projects", true);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a failing page load until that same request answers - another endpoint answering is not enough", () => {
    reportAnswer("/api/projects", true);
    reportAnswer("/api/auth/csrf", false);
    expect(isServerUnreachable()).toBe(true);

    reportAnswer("/api/projects", false);
    expect(isServerUnreachable()).toBe(false);
  });

  it("drops, after asking again, a failure that did not happen again, and keeps one that did", async () => {
    reportAnswer("/api/projects", true);
    reportAnswer("/api/old", true);

    await askAgain(async () => reportAnswer("/api/projects", true));
    expect(isServerUnreachable()).toBe(true);

    await askAgain(async () => undefined);
    expect(isServerUnreachable()).toBe(false);
  });

  it("is set by a request that gets no answer, and cleared by the next answer", async () => {
    respondWith(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api.getProjects()).rejects.toThrow(/reach/i);
    expect(isServerUnreachable()).toBe(true);

    respondWith(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    await api.getProjects();
    expect(isServerUnreachable()).toBe(false);
  });

  it("is set by the Gateway's JSON 503 for a service that is down, when a page loads its list", async () => {
    respondWith(async () => new Response(JSON.stringify({ status: 503, error: "Service Unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    await expect(api.getProjects()).rejects.toThrow();
    expect(isServerUnreachable()).toBe(true);
  });

  it("is not set by the backend's JSON error to a write - a full runner pool - but is by the dev proxy's empty one", async () => {
    respondWith(async (url?: unknown) =>
      String(url).endsWith("/api/auth/csrf")
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ message: "busy", code: "CAPACITY_UNAVAILABLE" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    await expect(api.startPreview("1")).rejects.toThrow("busy");
    expect(isServerUnreachable()).toBe(false);

    respondWith(async (url?: unknown) =>
      String(url).endsWith("/api/auth/csrf")
        ? new Response(null, { status: 204 })
        : new Response(null, { status: 500, headers: { "Content-Type": "text/plain" } }));
    await expect(api.startPreview("1")).rejects.toThrow();
    expect(isServerUnreachable()).toBe(true);
  });

  it("is not set by a request the page itself abandoned", async () => {
    respondWith(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(api.getProjects()).rejects.toThrow();
    expect(isServerUnreachable()).toBe(false);
  });
});
