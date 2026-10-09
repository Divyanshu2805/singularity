/**
 * Tests for splitting the server's member list into members and open invitations.
 *
 * Handles: a row with a user id is a member, a row with only an invite id is an invitation addressed to its email, a
 * row with neither is dropped, and the wording of what a role lets someone do.
 */
import { describe, expect, it } from "vitest";
import { roleOffer, splitPeople } from "./members";

describe("splitPeople", () => {
  it("keeps members and open invitations apart", () => {
    const people = splitPeople([
      { userId: 1, inviteId: null, username: "owner@example.com", name: "Owner", role: "OWNER", invitedAt: "2026-10-01T10:00:00Z", acceptedAt: "2026-10-01T10:00:00Z" },
      { userId: null, inviteId: 5, username: "new@example.com", name: null, role: "EDITOR", invitedAt: "2026-10-02T10:00:00Z", acceptedAt: null },
    ]);

    expect(people.members).toEqual([
      { userId: 1, username: "owner@example.com", name: "Owner", role: "OWNER", invitedAt: "2026-10-01T10:00:00Z" },
    ]);
    expect(people.invites).toEqual([
      { inviteId: 5, email: "new@example.com", role: "EDITOR", invitedAt: "2026-10-02T10:00:00Z" },
    ]);
  });

  it("drops a row that is neither", () => {
    const people = splitPeople([{ userId: null, inviteId: null, username: "ghost@example.com", role: "VIEWER" }]);

    expect(people.members).toEqual([]);
    expect(people.invites).toEqual([]);
  });
});

describe("roleOffer", () => {
  it("says what the role lets someone do", () => {
    expect(roleOffer("VIEWER")).toBe("view");
    expect(roleOffer("EDITOR")).toBe("edit");
  });
});
