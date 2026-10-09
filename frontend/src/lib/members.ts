/**
 * Telling a project's members apart from its invitations that nobody has answered yet.
 *
 * Handles: splitting the one list the server returns into people who are on the project and open invitations, and the
 * sentence an invitation is described with.
 *
 * The server sends both in one list. A member has a user id; an open invitation has an id of its own, the address it
 * was sent to, and no name - whether or not anyone has an account at that address, so the list cannot be used to find
 * out. A row with neither id is dropped rather than guessed at.
 */
import type { PendingInvite, ProjectMember, ProjectMemberEntry, ProjectRole } from "./types";

export interface ProjectPeople {
  members: ProjectMember[];
  invites: PendingInvite[];
}

export function splitPeople(entries: ProjectMemberEntry[]): ProjectPeople {
  const members: ProjectMember[] = [];
  const invites: PendingInvite[] = [];
  for (const entry of entries) {
    if (typeof entry.userId === "number") {
      members.push({
        userId: entry.userId,
        username: entry.username,
        name: entry.name ?? undefined,
        role: entry.role,
        invitedAt: entry.invitedAt ?? undefined,
      });
    } else if (typeof entry.inviteId === "number") {
      invites.push({
        inviteId: entry.inviteId,
        email: entry.username,
        role: entry.role,
        invitedAt: entry.invitedAt ?? undefined,
      });
    }
  }
  return { members, invites };
}

export function roleOffer(role: ProjectRole): string {
  return role === "VIEWER" ? "view" : "edit";
}
