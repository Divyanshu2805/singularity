/**
 * Covers the GitHub panel: that it draws nothing when the deployment has no GitHub app, that only the owner is
 * offered controls, that each state says the right thing and offers the right action, that a repository name is
 * checked before anything is sent, that connecting leaves only for GitHub's own address, and that forgetting a
 * repository asks first.
 *
 * The server is mocked at the api module; what is under test is what the person sees and which calls a press makes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    getProjectGitHub: vi.fn(),
    pushToGitHub: vi.fn(),
    getRevisions: vi.fn(),
    forgetGitHubRepository: vi.fn(),
    startGitHubConnect: vi.fn(),
    disconnectGitHub: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { GitHubMenu } from "./GitHubMenu";
import type { ProjectGitHub, RevisionSummary } from "@/lib/types";
import type { TurnForHistory } from "@/lib/revisions";

const notConnected: ProjectGitHub = {
  available: true, connected: false, login: null, linked: false, fullName: null, url: null, privateRepo: null,
  lastPushedAt: null, hasChanges: false, suggestedName: "noughts", leftOut: [],
};
const connected: ProjectGitHub = { ...notConnected, connected: true, login: "asha" };
const pushed: ProjectGitHub = {
  ...connected, linked: true, fullName: "asha/noughts", url: "https://github.com/asha/noughts", privateRepo: true,
  lastPushedAt: new Date().toISOString(), suggestedName: null,
};

function renderMenu(state: ProjectGitHub, role = "OWNER", turns: TurnForHistory[] = []) {
  vi.mocked(api.getProjectGitHub).mockResolvedValue(state);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
      <MemoryRouter>
        <GitHubMenu projectId="7" role={role} projectName="Noughts" turns={turns} />
      </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

async function open() {
  fireEvent.click(await screen.findByRole("button", { name: /^GitHub\./ }));
}

describe("GitHubMenu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  it("draws nothing when the deployment has no GitHub app", async () => {
    renderMenu({ ...notConnected, available: false });

    await waitFor(() => expect(api.getProjectGitHub).toHaveBeenCalledWith("7"));
    expect(screen.queryByRole("button", { name: /GitHub/ })).toBeNull();
  });

  it("offers an owner who has not connected one thing: Connect GitHub", async () => {
    renderMenu(notConnected);
    await open();

    expect(await screen.findByText("Not connected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeTruthy();
    expect(screen.queryByLabelText("Repository name")).toBeNull();
  });

  it("leaves for GitHub's own address, remembering the project to come back to", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/projects/7", assign });
    vi.mocked(api.startGitHubConnect).mockResolvedValue("https://github.com/login/oauth/authorize?client_id=x&state=s");
    renderMenu(notConnected);
    await open();

    fireEvent.click(await screen.findByRole("button", { name: "Connect GitHub" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?client_id=x&state=s"));
    expect(sessionStorage.getItem("github:return")).toBe("/projects/7");
    vi.unstubAllGlobals();
  });

  it("goes nowhere when the address it was given is not GitHub's", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/projects/7", assign });
    vi.mocked(api.startGitHubConnect).mockResolvedValue("https://github.com.evil.example/login/oauth/authorize");
    renderMenu(notConnected);
    await open();

    fireEvent.click(await screen.findByRole("button", { name: "Connect GitHub" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Connect GitHub" })).not.toHaveProperty("disabled", true));
    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("github:return")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("lets a connected owner name the repository, keeps it private unless told otherwise, and pushes", async () => {
    vi.mocked(api.pushToGitHub).mockResolvedValue(pushed);
    renderMenu(connected);
    await open();

    const field = await screen.findByLabelText("Repository name");
    expect(field.getAttribute("placeholder")).toBe("noughts");
    fireEvent.change(field, { target: { value: "my-game" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and push" }));

    await waitFor(() => expect(api.pushToGitHub).toHaveBeenCalledWith("7", "my-game", true, undefined));
    expect(await screen.findByText("asha/noughts")).toBeTruthy();
  });

  it("sends a public repository only when Public is chosen", async () => {
    vi.mocked(api.pushToGitHub).mockResolvedValue({ ...pushed, privateRepo: false });
    renderMenu(connected);
    await open();

    fireEvent.click(await screen.findByRole("radio", { name: "Public" }));
    fireEvent.click(screen.getByRole("button", { name: "Create and push" }));

    await waitFor(() => expect(api.pushToGitHub).toHaveBeenCalledWith("7", "", false, undefined));
  });

  it("says what is wrong with a name and sends nothing", async () => {
    renderMenu(connected);
    await open();

    fireEvent.change(await screen.findByLabelText("Repository name"), { target: { value: "my game" } });

    expect(screen.getByText(/letters, digits, dots, hyphens and underscores/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create and push" })).toHaveProperty("disabled", true);
    expect(api.pushToGitHub).not.toHaveBeenCalled();
  });

  it("shows a pushed project its repository, and offers Push changes only when there are some", async () => {
    renderMenu(pushed);
    await open();

    const link = await screen.findByRole("link", { name: /Open the repository on GitHub/ });
    expect(link.getAttribute("href")).toBe("https://github.com/asha/noughts");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("On GitHub")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Push changes" })).toBeNull();
  });

  it("pushes changes with one press and says what was left out on purpose", async () => {
    vi.mocked(api.pushToGitHub).mockResolvedValue({ ...pushed, leftOut: [".env"] });
    vi.mocked(api.getRevisions).mockRejectedValue(new Error("offline"));
    renderMenu({ ...pushed, hasChanges: true });
    await open();

    expect(await screen.findByText("Changes not pushed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Push changes" }));

    await waitFor(() => expect(api.pushToGitHub).toHaveBeenCalledWith("7", undefined, true, undefined));
    expect(await screen.findByText(/Left out on purpose: \.env\./)).toBeTruthy();
  });

  it("sends the newest change, in History's words, as what the commit should say", async () => {
    const revision = (id: number): RevisionSummary => ({
      id, parentRevisionId: id - 1, status: "APPLIED", source: "AI_GENERATION", createdByUserId: 1, createdAt: null,
      appliedAt: null, changedPaths: ["src/App.tsx"],
    });
    vi.mocked(api.pushToGitHub).mockResolvedValue(pushed);
    vi.mocked(api.getRevisions).mockResolvedValue([revision(4), revision(5)]);
    renderMenu({ ...pushed, hasChanges: true }, "OWNER", [
      { role: "user", content: "Build a noughts and crosses game" },
      { role: "assistant", content: "", revisionId: 4 },
      { role: "user", content: "Add a **rematch** button\nunder the board" },
      { role: "assistant", content: "", revisionId: 5 },
    ]);
    await open();

    fireEvent.click(await screen.findByRole("button", { name: "Push changes" }));

    await waitFor(() => expect(api.pushToGitHub).toHaveBeenCalledWith("7", undefined, true, "Add a rematch button"));
  });

  it("asks before forgetting a repository, and says the repository itself is left alone", async () => {
    vi.mocked(api.forgetGitHubRepository).mockResolvedValue();
    renderMenu(pushed);
    await open();

    fireEvent.click(await screen.findByRole("button", { name: "Forget repository" }));
    expect(api.forgetGitHubRepository).not.toHaveBeenCalled();
    expect(await screen.findByText(/The repository stays on GitHub exactly as it is/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Forget it" }));
    await waitFor(() => expect(api.forgetGitHubRepository).toHaveBeenCalledWith("7"));
  });

  it("disconnects the account with one press", async () => {
    vi.mocked(api.disconnectGitHub).mockResolvedValue();
    renderMenu(connected);
    await open();

    expect(await screen.findByTitle("Connected as asha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(api.disconnectGitHub).toHaveBeenCalled());
  });

  it("gives someone who is not the owner the repository's link and no controls", async () => {
    renderMenu(pushed, "EDITOR");
    await open();

    expect(await screen.findByRole("link", { name: /Open the repository on GitHub/ })).toBeTruthy();
    for (const name of ["Push changes", "Forget repository", "Disconnect", "Connect GitHub"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("tells someone who is not the owner that only the owner can push, when there is no repository", async () => {
    renderMenu(notConnected, "VIEWER");
    await open();

    expect(await screen.findByText("Only the project's owner can push it to GitHub.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
  });
});
