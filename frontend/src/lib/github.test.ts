import { beforeEach, describe, expect, it } from "vitest";
import {
  canPush,
  gitHubHeadline,
  isGitHubAddress,
  leftOutSentence,
  pushLabel,
  pushedAgo,
  rememberReturnPath,
  repoNameProblem,
  safeReturnPath,
  takeReturnPath,
} from "./github";
import type { ProjectGitHub } from "./types";

const never: ProjectGitHub = {
  available: true, connected: false, login: null, linked: false, fullName: null, url: null, privateRepo: null,
  lastPushedAt: null, hasChanges: false, suggestedName: "noughts", leftOut: [],
};
const connected: ProjectGitHub = { ...never, connected: true, login: "asha" };
const pushed: ProjectGitHub = {
  ...connected, linked: true, fullName: "asha/noughts", url: "https://github.com/asha/noughts", privateRepo: true,
  lastPushedAt: "2026-10-10T10:00:00Z", suggestedName: null,
};
const now = new Date("2026-10-10T10:05:00Z");

describe("who can push", () => {
  it("is the owner only", () => {
    expect(canPush("OWNER")).toBe(true);
    expect(canPush("EDITOR")).toBe(false);
    expect(canPush("VIEWER")).toBe(false);
    expect(canPush(undefined)).toBe(false);
  });
});

describe("repository names", () => {
  it("accepts what GitHub takes, and an empty field, which means the suggested name", () => {
    for (const name of ["noughts", "My_App-2.0", "a", "a".repeat(100), "", "  "]) expect(repoNameProblem(name)).toBeNull();
  });

  it("refuses each kind of bad name with a sentence, as the server does", () => {
    expect(repoNameProblem("a".repeat(101))).toContain("at most 100");
    expect(repoNameProblem("my app")).toContain("letters, digits, dots, hyphens and underscores");
    expect(repoNameProblem("owner/repo")).toContain("letters, digits");
    expect(repoNameProblem("café")).toContain("letters, digits");
    expect(repoNameProblem("..")).toContain("dots alone");
    expect(repoNameProblem(".")).toContain("dots alone");
    expect(repoNameProblem("thing.GIT")).toContain(".git");
  });
});

describe("the headline", () => {
  it("says one thing for each state", () => {
    expect(gitHubHeadline(undefined).title).toBe("GitHub");
    expect(gitHubHeadline(never).title).toBe("Not connected");
    expect(gitHubHeadline(connected)).toMatchObject({ title: "Not on GitHub yet", detail: "Push to make a repository under asha." });
    expect(gitHubHeadline({ ...pushed, lastPushedAt: null, hasChanges: true }).title).toBe("Repository made");
    expect(gitHubHeadline({ ...pushed, hasChanges: true })).toMatchObject({ title: "Changes not pushed", tone: "waiting" });
    expect(gitHubHeadline(pushed, now)).toMatchObject({ title: "On GitHub", detail: "Pushed 5 minutes ago.", tone: "live" });
  });

  it("says how long ago in the largest unit that fits", () => {
    expect(pushedAgo("2026-10-10T10:04:40Z", now)).toBe("just now");
    expect(pushedAgo("2026-10-10T10:04:00Z", now)).toBe("1 minute ago");
    expect(pushedAgo("2026-10-10T07:05:00Z", now)).toBe("3 hours ago");
    expect(pushedAgo("2026-10-08T10:05:00Z", now)).toBe("2 days ago");
    expect(pushedAgo("2026-10-10T11:00:00Z", now)).toBe("just now");
  });

  it("names the button for what pressing it does", () => {
    expect(pushLabel(connected)).toBe("Create and push");
    expect(pushLabel({ ...pushed, lastPushedAt: null })).toBe("Push");
    expect(pushLabel(pushed)).toBe("Push changes");
  });
});

describe("leaving for GitHub and coming back", () => {
  beforeEach(() => sessionStorage.clear());

  it("sends the browser only to GitHub's own address", () => {
    expect(isGitHubAddress("https://github.com/login/oauth/authorize?client_id=x")).toBe(true);
    expect(isGitHubAddress("http://github.com/login/oauth/authorize")).toBe(false);
    expect(isGitHubAddress("https://github.com.evil.example/login")).toBe(false);
    expect(isGitHubAddress("https://evil.example/?https://github.com/")).toBe(false);
    expect(isGitHubAddress("javascript:alert(1)")).toBe(false);
    expect(isGitHubAddress("not a url")).toBe(false);
    expect(isGitHubAddress(null)).toBe(false);
  });

  it("comes back only to a project's page in this app", () => {
    expect(safeReturnPath("/projects/42")).toBe("/projects/42");
    expect(safeReturnPath("/projects/42/../../login")).toBe("/projects");
    expect(safeReturnPath("//evil.example")).toBe("/projects");
    expect(safeReturnPath("https://evil.example/projects/42")).toBe("/projects");
    expect(safeReturnPath(null)).toBe("/projects");
  });

  it("remembers the place once, and forgets it when it is used", () => {
    rememberReturnPath("/projects/42");
    expect(takeReturnPath()).toBe("/projects/42");
    expect(takeReturnPath()).toBe("/projects");
    sessionStorage.setItem("github:return", "https://evil.example");
    expect(takeReturnPath()).toBe("/projects");
  });
});

describe("what a push left out", () => {
  it("is said, and nothing is said when nothing was", () => {
    expect(leftOutSentence([])).toBeNull();
    expect(leftOutSentence(undefined)).toBeNull();
    expect(leftOutSentence([".env"])).toContain("Left out on purpose: .env.");
    expect(leftOutSentence([".env", "a", "b", "c", "d"])).toContain(".env, a, b and 2 more.");
  });
});
