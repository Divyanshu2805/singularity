/**
 * Covers confirmSession, the one question asked of the server before a signed-in page draws: a session the server
 * still honours opens the page and is not asked about again, one it has ended is forgotten without a reload, a
 * browser that remembers nobody is not asked at all, and a server that does not answer leaves the page to open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: 1, username: "ada@example.com", name: "Ada" };

function remember() {
  localStorage.setItem("session_expires_at", new Date(Date.now() + 60_000).toISOString());
  localStorage.setItem("user_info", JSON.stringify(user));
}

function answerMe(respond: () => Promise<Response>) {
  const fetchMock = vi.fn((url: string) =>
    String(url).endsWith("/api/auth/me") ? respond() : Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const freshApi = async () => {
  vi.resetModules();
  return import("./api");
};

beforeEach(() => localStorage.clear());

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("confirmSession", () => {
  it("opens the page when the server still knows the session, and asks only once per page load", async () => {
    remember();
    const fetchMock = answerMe(async () => new Response(JSON.stringify(user), { status: 200 }));
    const { confirmSession, isSessionConfirmed } = await freshApi();

    expect(isSessionConfirmed()).toBe(false);
    expect(await confirmSession()).toBe(true);
    expect(await confirmSession()).toBe(true);
    expect(isSessionConfirmed()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forgets a session the server has ended, so nothing of the old account is drawn", async () => {
    remember();
    localStorage.setItem("open_tabs_7", "[]");
    answerMe(async () => new Response(null, { status: 401 }));
    const { confirmSession, isAuthenticated, getUserInfo } = await freshApi();

    expect(await confirmSession()).toBe(false);
    expect(isAuthenticated()).toBe(false);
    expect(getUserInfo()).toBeNull();
    expect(localStorage.getItem("open_tabs_7")).toBeNull();
  });

  it("asks again after a session was forgotten, so signing in afresh on the same page is not refused", async () => {
    remember();
    let status = 401;
    answerMe(async () => new Response(null, { status }));
    const { confirmSession } = await freshApi();

    expect(await confirmSession()).toBe(false);
    remember();
    status = 200;
    expect(await confirmSession()).toBe(true);
  });

  it("does not ask when the browser remembers nobody", async () => {
    const fetchMock = answerMe(async () => new Response(null, { status: 200 }));
    const { confirmSession } = await freshApi();

    expect(await confirmSession()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the page open when the server cannot be reached, leaving that to the unreachable screen", async () => {
    remember();
    answerMe(() => Promise.reject(new TypeError("Failed to fetch")));
    const { confirmSession, isAuthenticated } = await freshApi();

    expect(await confirmSession()).toBe(true);
    expect(isAuthenticated()).toBe(true);
  });
});
