/**
 * What the GitHub panel says and does, as pure functions.
 *
 * Handles: who sees which controls, the one headline for each state a project can be in with its repository, checking
 * a repository name before it is sent, deciding that an address is really GitHub's before the browser is sent to it,
 * and keeping the place to come back to across the trip to GitHub and back.
 *
 * The name rules repeat the server's (GitHubRepoName.java): the server and then GitHub enforce them, this only saves a
 * round trip and says why in the field. A rule changed there must change here; github.test.ts holds the cases both
 * agree on.
 *
 * The address check is not decoration. The browser is about to leave the app for an address that came from a
 * response; it goes only to https://github.com, whatever the response said. The place to come back to is checked the
 * same way on the way in: it is used only if it is a project's page in this app.
 */
import type { ProjectGitHub, ProjectRole } from "./types";

export const REPO_NAME_MAX = 100;
const RETURN_KEY = "github:return";

export const canPush = (role: ProjectRole | string | undefined) => role === "OWNER";

export function repoNameProblem(input: string): string | null {
  const name = input.trim();
  if (!name) return null;
  if (name.length > REPO_NAME_MAX) return `A repository name can be at most ${REPO_NAME_MAX} characters.`;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return "A repository name can hold letters, digits, dots, hyphens and underscores only.";
  if (name === "." || name === "..") return "A repository cannot be named with dots alone.";
  if (name.toLowerCase().endsWith(".git")) return "A repository name cannot end in .git.";
  return null;
}

export type GitHubTone = "idle" | "live" | "waiting";

export interface GitHubHeadline {
  title: string;
  detail: string;
  tone: GitHubTone;
}

export function gitHubHeadline(state: ProjectGitHub | null | undefined, now: Date = new Date()): GitHubHeadline {
  if (!state) return { title: "GitHub", detail: "Checking where this project stands.", tone: "idle" };
  if (state.linked && state.lastPushedAt && !state.hasChanges) {
    return { title: "On GitHub", detail: `Pushed ${pushedAgo(state.lastPushedAt, now)}.`, tone: "live" };
  }
  if (state.linked && state.lastPushedAt) {
    return { title: "Changes not pushed", detail: "The project has changed since it was last pushed.", tone: "waiting" };
  }
  if (state.linked) {
    return { title: "Repository made", detail: "Its files have not been pushed yet. Push to send them.", tone: "waiting" };
  }
  if (state.connected) {
    return { title: "Not on GitHub yet", detail: `Push to make a repository under ${state.login ?? "your account"}.`, tone: "idle" };
  }
  return { title: "Not connected", detail: "Connect GitHub to keep this project in a repository of your own.", tone: "idle" };
}

export function pushedAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(seconds)) return "earlier";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export const pushLabel = (state: ProjectGitHub | null | undefined) =>
  !state?.linked ? "Create and push" : state.lastPushedAt ? "Push changes" : "Push";

export function isGitHubAddress(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com";
  } catch {
    return false;
  }
}

export function safeReturnPath(path: string | null | undefined): string {
  return path && /^\/projects\/[A-Za-z0-9_-]+$/.test(path) ? path : "/projects";
}

export function rememberReturnPath(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    return;
  }
}

export function takeReturnPath(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return safeReturnPath(path);
  } catch {
    return safeReturnPath(null);
  }
}

export function leftOutSentence(paths: readonly string[] | null | undefined): string | null {
  if (!paths || paths.length === 0) return null;
  const shown = paths.slice(0, 3).join(", ");
  const more = paths.length > 3 ? ` and ${paths.length - 3} more` : "";
  return `Left out on purpose: ${shown}${more}. Environment files and GitHub Actions workflows are never pushed.`;
}
