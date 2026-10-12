/**
 * Covers the page GitHub sends the browser back to: that the code and state are handed to the server once and the
 * person is taken back to the project they left, and that each way it can go wrong - GitHub refused, nothing came
 * back, the server did not accept it - is said in words with a way back, without calling the server when there is
 * nothing to send.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { finishGitHubConnect: vi.fn() },
}));

import { api } from "@/lib/api";
import { GitHubCallback } from "./GitHubCallback";

function renderAt(address: string) {
  render(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/github/callback" element={<GitHubCallback />} />
        <Route path="/projects/:id" element={<p>the project page</p>} />
        <Route path="/projects" element={<p>the projects list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("GitHubCallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  it("hands the code and state to the server once and goes back to the project the person left", async () => {
    sessionStorage.setItem("github:return", "/projects/7");
    vi.mocked(api.finishGitHubConnect).mockResolvedValue({ available: true, connected: true, login: "asha" });

    renderAt("/github/callback?code=code-9&state=7.123.abc.sig");

    expect(await screen.findByText("the project page")).toBeTruthy();
    expect(api.finishGitHubConnect).toHaveBeenCalledTimes(1);
    expect(api.finishGitHubConnect).toHaveBeenCalledWith("code-9", "7.123.abc.sig");
    expect(sessionStorage.getItem("github:return")).toBeNull();
  });

  it("goes to the projects list when the place to come back to is not a project's page", async () => {
    sessionStorage.setItem("github:return", "https://evil.example/");
    vi.mocked(api.finishGitHubConnect).mockResolvedValue({ available: true, connected: true, login: "asha" });

    renderAt("/github/callback?code=c&state=s");

    expect(await screen.findByText("the projects list")).toBeTruthy();
  });

  it("says GitHub was not connected when the request was turned down there, and calls nothing", async () => {
    renderAt("/github/callback?error=access_denied&state=s");

    expect(await screen.findByText(/the request was turned down there/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to your project" })).toBeTruthy();
    expect(api.finishGitHubConnect).not.toHaveBeenCalled();
  });

  it("says so when nothing came back to finish with", async () => {
    renderAt("/github/callback");

    expect(await screen.findByText(/GitHub sent nothing back/)).toBeTruthy();
    expect(api.finishGitHubConnect).not.toHaveBeenCalled();
  });

  it("shows the server's own sentence when it does not accept what came back, with a way to the project", async () => {
    sessionStorage.setItem("github:return", "/projects/7");
    vi.mocked(api.finishGitHubConnect).mockRejectedValue(new Error("That GitHub sign-in has run out or was not started from this account. Start it again."));

    renderAt("/github/callback?code=old&state=s");

    expect(await screen.findByText(/has run out or was not started from this account/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("link", { name: "Back to your project" }).getAttribute("href")).toBe("/projects/7"));
  });
});
