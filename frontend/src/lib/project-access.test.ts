/**
 * Tests for lib/project-access: which failed loads are "not yours to open" and which are worth another try.
 *
 * Handles: a forbidden, missing or malformed project is unavailable and never names which of those it was; a server
 * or network failure is an error that carries its own message.
 */
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import { projectLoadFailure } from "./project-access";

describe("projectLoadFailure", () => {
  it.each([403, 404, 400])("treats a %i as a project that isn't available, with the same words each time", (status) => {
    const failure = projectLoadFailure(new ApiRequestError("Access denied", status));

    expect(failure.kind).toBe("unavailable");
    expect(failure.title).toBe("This project isn't available");
    expect(failure.detail).not.toContain("Access denied");
  });

  it("treats a server failure as worth trying again and keeps its message", () => {
    const failure = projectLoadFailure(new ApiRequestError("The server is restarting", 503));

    expect(failure.kind).toBe("error");
    expect(failure.detail).toBe("The server is restarting");
  });

  it("gives a network failure a sentence of its own when it has none", () => {
    expect(projectLoadFailure(new Error("")).detail).toBe("Check your connection and try again.");
    expect(projectLoadFailure("nope").kind).toBe("error");
  });
});
