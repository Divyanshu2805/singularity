import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError } from "./api";
import { describePreviewStartFailure } from "./preview";

/** Answers the CSRF priming call with a 204 and everything else with the given response. */
function respondWith(status: number, body?: unknown) {
  const payload = body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/api/auth/csrf")
        ? new Response(null, { status: 204 })
        : new Response(payload, { status, headers: { "Content-Type": typeof body === "string" ? "text/html" : "application/json" } })
    )
  );
}

const startFailure = () =>
  api.startPreview("1").then(
    () => {
      throw new Error("expected startPreview to fail");
    },
    (error: unknown) => error as ApiRequestError
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiRequestError.code", () => {
  it("carries the backend's error code - the only thing that tells a full pool from a failed dependency, both 503", async () => {
    respondWith(503, { status: "503 SERVICE_UNAVAILABLE", message: "Every preview runner is busy right now.", code: "CAPACITY_UNAVAILABLE" });

    const error = await startFailure();

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 503, code: "CAPACITY_UNAVAILABLE", message: "Every preview runner is busy right now." });
  });

  it("is absent when the backend sent none, and a code that isn't a string is ignored", async () => {
    respondWith(503, { message: "x" });
    expect((await startFailure()).code).toBeUndefined();

    respondWith(503, { message: "x", code: 5 });
    expect((await startFailure()).code).toBeUndefined();
  });

  it("stays absent on a non-JSON 5xx - the dev proxy with nobody to ask - which then reads as 'server unreachable'", async () => {
    respondWith(502, "<html>Bad Gateway</html>");

    const error = await startFailure();

    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/Can't reach the VibeCraft server/);
    expect(error.message).toMatch(/port 8000/);
  });
});

// The join between the two halves: what the API client makes of a real response body is what the panel classifies.
describe("a start that fails, end to end", () => {
  it("a full pool comes out as 'busy' and a failed dependency as 'failed' - the same 503 status", async () => {
    respondWith(503, { message: "Every preview runner is busy right now. Try again in a minute.", code: "CAPACITY_UNAVAILABLE" });
    expect(describePreviewStartFailure(await startFailure()).kind).toBe("busy");

    respondWith(503, { message: "This is temporarily unavailable. Please try again.", code: "UPSTREAM_UNAVAILABLE" });
    const failed = describePreviewStartFailure(await startFailure());
    expect(failed.kind).toBe("failed");
    expect(failed.title).not.toMatch(/busy/i);
  });

  it("a bare 503 from the proxy comes out as 'unreachable', not 'busy'", async () => {
    respondWith(503, "<html>Service Unavailable</html>");

    expect(describePreviewStartFailure(await startFailure()).kind).toBe("unreachable");
  });
});
