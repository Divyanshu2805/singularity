/**
 * A project's history, put into words a person who has never used version control can read.
 *
 * Handles: turning the server's list of revisions into the entries the History panel shows - what each one was, who
 * made it, which files it touched, which one the project is on now - naming a revision made by a build after the
 * request that asked for it, saying in one sentence what a restore would do to the files, and deciding which chat
 * turns can be undone.
 *
 * A revision made by going back is named after what it went back to - "Went back to: Add a search box", "Undid: Add
 * a search box" - and the entry the project now matches is marked, because three entries all reading "Went back to an
 * earlier version" told nobody which version they were on. A restore made before the server recorded its target keeps
 * the plain wording.
 *
 * A revision is named from the caller's own conversation, since each person has their own chat: a build somebody
 * else asked for is named by who made it, not by words this person never saw. Only revisions that landed are shown;
 * one that failed or lost a race never became a state of the project and is not something to go back to.
 */
import type { ProjectMember, RevisionChange, RevisionSource, RevisionSummary, TurnOutcome } from "./types";

export interface HistoryEntry {
  id: number;
  title: string;
  byline: string | null;
  files: string;
  paths: string[];
  at: string | null;
  source: RevisionSource;
  isCurrent: boolean;
  /** An older entry the project is the same as right now, because the newest change went back to it. */
  matchesCurrent: boolean;
}

export interface TurnForHistory {
  role: "user" | "assistant";
  content: string;
  revisionId?: number | null;
}

const TITLE_LIMIT = 90;

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function shorten(text: string): string {
  const firstLine = text
    .replace(/[*_`#>]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
  return firstLine.length > TITLE_LIMIT ? `${firstLine.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : firstLine;
}

/** "App.tsx", "App.tsx and index.css", "App.tsx, index.css and 3 more". */
export function describeFiles(paths: readonly string[]): string {
  if (paths.length === 0) return "No files";
  const names = paths.map(fileName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The request each revision answered, for the revisions this person's own turns made. */
export function requestsByRevision(turns: readonly TurnForHistory[]): Map<number, string> {
  const requests = new Map<number, string>();
  let lastRequest = "";
  for (const turn of turns) {
    if (turn.role === "user") {
      lastRequest = turn.content;
    } else if (turn.revisionId != null && lastRequest) {
      requests.set(turn.revisionId, lastRequest);
    }
  }
  return requests;
}

const STARTING_POINT = "the starting point";

function titleFor(
  revision: RevisionSummary,
  requests: Map<number, string>,
  byId: Map<number, RevisionSummary>,
  depth = 0
): string {
  if (revision.source === "RESTORE") {
    const chosen = revision.restoredRevisionId != null ? byId.get(revision.restoredRevisionId) : undefined;
    if (!chosen || depth > 8) return "Went back to an earlier version";
    const name = titleFor(chosen, requests, byId, depth + 1);
    if (chosen.source === "RESTORE" && !revision.restoredBefore) return name;
    return revision.restoredBefore ? `Undid: ${name}` : `Went back to: ${name}`;
  }
  const request = requests.get(revision.id);
  if (revision.source === "MANUAL_EDIT") {
    return revision.changedPaths.length === 1
      ? `Edited ${fileName(revision.changedPaths[0])} by hand`
      : "Edited by hand";
  }
  const asked = request ? shorten(request) : "";
  return asked || "A change built with AI";
}

/**
 * The revision whose files the project holds after this one: itself, unless it went back to another. Null means the
 * files as they were before any change; undefined means a restore whose target the server did not record.
 */
function settlesOn(revision: RevisionSummary, byId: Map<number, RevisionSummary>, depth = 0): number | null | undefined {
  if (revision.source !== "RESTORE") return revision.id;
  const chosen = revision.restoredRevisionId != null ? byId.get(revision.restoredRevisionId) : undefined;
  if (!chosen || depth > 8) return undefined;
  if (!revision.restoredBefore) return settlesOn(chosen, byId, depth + 1);
  const parent = chosen.parentRevisionId != null ? byId.get(chosen.parentRevisionId) : undefined;
  if (chosen.parentRevisionId == null) return null;
  return parent ? settlesOn(parent, byId, depth + 1) : undefined;
}

export function historyEntries(
  revisions: readonly RevisionSummary[],
  turns: readonly TurnForHistory[],
  members: readonly ProjectMember[],
  currentUserId: number | null | undefined
): HistoryEntry[] {
  const requests = requestsByRevision(turns);
  const applied = revisions.filter((revision) => revision.status === "APPLIED").sort((a, b) => b.id - a.id);
  const byId = new Map(applied.map((revision) => [revision.id, revision]));
  const now = applied.length > 0 ? settlesOn(applied[0], byId) : undefined;
  return applied.map((revision, index) => {
    const maker = members.find((member) => member.userId === revision.createdByUserId);
    const byline = revision.createdByUserId === currentUserId
      ? "You"
      : maker
        ? maker.name || maker.username
        : null;
    return {
      id: revision.id,
      title: titleFor(revision, requests, byId),
      byline,
      files: `${plural(revision.changedPaths.length, "file")}: ${describeFiles(revision.changedPaths)}`,
      paths: revision.changedPaths,
      at: revision.appliedAt ?? revision.createdAt ?? null,
      source: revision.source,
      isCurrent: index === 0,
      matchesCurrent: index !== 0 && now === revision.id,
    };
  });
}

/** One sentence saying what a restore would do, or that it would do nothing. */
export function restoreSummary(changes: readonly RevisionChange[]): string {
  const count = (kind: RevisionChange["kind"]) => changes.filter((change) => change.kind === kind).length;
  const parts = [
    count("MODIFIED") > 0 ? `${plural(count("MODIFIED"), "file")} will go back to how ${count("MODIFIED") === 1 ? "it was" : "they were"}` : "",
    count("DELETED") > 0 ? `${plural(count("DELETED"), "file")} added since will be removed` : "",
    count("ADDED") > 0 ? `${plural(count("ADDED"), "file")} deleted since will come back` : "",
  ].filter(Boolean);
  if (parts.length === 0) return "Your project already matches this version, so nothing would change.";
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

const UNDOABLE: readonly TurnOutcome[] = ["SAVED", "INCOMPLETE", "OUT_OF_BUDGET"];

/** A turn can be undone when its files were saved and the server recorded which revision that was. */
export const canUndoTurn = (turn: { revisionId?: number | null; outcome?: TurnOutcome; isStreaming?: boolean }) =>
  turn.revisionId != null && !turn.isStreaming && !!turn.outcome && UNDOABLE.includes(turn.outcome);

/** "Just now", "5 minutes ago", "Yesterday", then a date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
