/**
 * What the Publish panel says and does, as pure functions.
 *
 * Handles: who sees which controls, the one headline for each state a published app can be in, the steps of a build and
 * how far along the current one is, how often to ask the server while a build runs (fast) and once it is live (slowly,
 * and only while the panel is open), checking a link name before it is sent, the sentence that tells a person what to
 * do about each kind of failure, and the addresses the panel copies and opens.
 *
 * The link-name rules repeat the server's (PublishedSlug.java): the server is what enforces them, this only saves a round
 * trip and says why in the field. A rule changed there must change here; publish.test.ts holds the cases both agree on.
 */
import type { ProjectRole, PublishFailureKind, PublishState } from "./types";

export const PUBLISH_STEPS = [
  "Collecting your files",
  "Starting a build machine",
  "Copying your files",
  "Installing packages",
  "Building your app",
  "Checking the result",
  "Collecting the build",
  "Putting it online",
] as const;

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

const RESERVED = new Set([
  "www", "api", "app", "apps", "admin", "administrator", "assets", "static", "cdn", "media", "files",
  "mail", "email", "smtp", "imap", "ftp", "ns1", "ns2", "dns", "mx",
  "login", "signin", "signup", "register", "auth", "oauth", "sso", "account", "accounts", "billing", "pay",
  "payment", "payments", "checkout", "support", "help", "status", "docs", "blog", "dashboard", "console",
  "singularity", "vibecraft", "preview", "previews", "publish", "published", "proxy", "gateway",
  "internal", "staging", "stage", "test", "testing", "dev", "prod", "production", "localhost", "root",
  "security", "abuse", "about", "terms", "privacy", "legal", "share", "shared", "embed", "download",
]);

/** Only the owner publishes; everyone else sees where it stands. */
export const canPublish = (role: ProjectRole | string | undefined) => role === "OWNER";

export type PublishPhase = "never" | "building" | "live" | "live-building" | "unpublished" | "failed" | "live-failed";

export function publishPhase(state: PublishState | null | undefined): PublishPhase {
  if (!state) return "never";
  const building = state.build?.status === "BUILDING";
  const failed = state.build?.status === "FAILED";
  if (state.live) return building ? "live-building" : failed ? "live-failed" : "live";
  if (building) return "building";
  if (failed) return "failed";
  return state.slug ? "unpublished" : "never";
}

export const isBuilding = (state: PublishState | null | undefined) => state?.build?.status === "BUILDING";

/** Which of the build's steps is under way, as a place in the list; -1 when the step is not one of the known ones. */
export function stepProgress(step: string | null | undefined): { index: number; total: number } {
  return { index: step ? PUBLISH_STEPS.indexOf(step as (typeof PUBLISH_STEPS)[number]) : -1, total: PUBLISH_STEPS.length };
}

export function publishPollInterval(state: PublishState | null | undefined, isOpen: boolean): number | false {
  if (isBuilding(state)) return 1500;
  if (!isOpen) return state?.live ? 30_000 : false;
  return 10_000;
}

export function buttonLabel(state: PublishState | null | undefined): string {
  switch (publishPhase(state)) {
    case "building":
    case "live-building":
      return "Publishing";
    case "live":
    case "live-failed":
      return state?.hasChanges ? "Update" : "Published";
    default:
      return "Publish";
  }
}

export interface Headline {
  tone: "idle" | "busy" | "good" | "warn" | "bad";
  title: string;
  detail: string;
}

export function headline(state: PublishState | null | undefined): Headline {
  switch (publishPhase(state)) {
    case "never":
      return { tone: "idle", title: "Not published", detail: "Put this app online at a link anyone can open - no account needed." };
    case "unpublished":
      return { tone: "idle", title: "Not published", detail: "Your link is kept for this project. Publish to put the app back online." };
    case "building":
      return { tone: "busy", title: "Publishing", detail: state?.build?.step ?? "Starting" };
    case "live-building":
      return { tone: "busy", title: "Updating", detail: state?.build?.step ?? "Starting" };
    case "failed":
      return { tone: "bad", title: "Couldn't publish", detail: state?.build?.failureMessage ?? "The build failed." };
    case "live-failed":
      return { tone: "bad", title: "The update failed", detail: `${state?.build?.failureMessage ?? "The build failed."} The app that is online is unchanged.` };
    default:
      return state?.hasChanges
        ? { tone: "warn", title: "You have changes that are not published", detail: "What is online is the version from the last time you published." }
        : { tone: "good", title: "Published", detail: "What is online is this project's latest version." };
  }
}

/** What to do about a failure, in a sentence; the failure's own message says what happened. */
export function failureAdvice(kind: PublishFailureKind | null | undefined): string {
  switch (kind) {
    case "INSTALL":
      return "Ask the chat to fix package.json, or look at the output below.";
    case "BUILD":
      return "Ask the chat to fix it - paste the output below if it helps.";
    case "NO_OUTPUT":
      return "The build has to write its page to the dist folder. Ask the chat to check the build setup.";
    case "TOO_LARGE":
      return "Remove large files or unused packages and try again.";
    case "TIMEOUT":
      return "The build took too long. Try again, or ask the chat to make the app lighter.";
    case "CAPACITY":
    case "PLATFORM":
      return "This was not your app's fault. Try again in a moment.";
    default:
      return "Try again.";
  }
}

/** True when a failure is worth trying again without changing anything. */
export const isRetryableAsIs = (kind: PublishFailureKind | null | undefined) => kind === "CAPACITY" || kind === "PLATFORM";

/** Why a link name is not acceptable, or null when it is. */
export function slugProblem(input: string): string | null {
  const slug = input.trim().toLowerCase();
  if (!slug) return null;
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return `Use ${SLUG_MIN} to ${SLUG_MAX} characters.`;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.includes("--")) {
    return "Use lower-case letters, numbers and single hyphens, not at the start or end.";
  }
  if (RESERVED.has(slug) || /^p\d+-/.test(slug)) return "That name isn't available.";
  return null;
}

/** The host part of a published link, for showing it without the scheme and the trailing slash. */
export function linkLabel(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The address of a shared app's public page in this app. */
export const sharePath = (slug: string) => `/p/${slug}`;

export const shareUrl = (origin: string, slug: string) => `${origin}${sharePath(slug)}`;

/** The text a person can paste to a friend. */
export const shareMessage = (name: string, url: string) => `${name} - ${url}`;
