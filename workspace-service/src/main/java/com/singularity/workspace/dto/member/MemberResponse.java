package com.singularity.workspace.dto.member;

import com.singularity.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * One collaborator on a project, or one invitation still waiting for an answer.
 *
 * <p>Handles: for a member, their id, email and display name, their role, and when they were invited and accepted;
 * for an open invitation, its own id, the address it was sent to, the role on offer and when it was sent.
 *
 * <p>An open invitation has no user id, no name and no acceptedAt, whether or not an account exists for the address:
 * the two cases must look the same, or the list would say which addresses are registered. A member's name and email
 * are not stored here - they come from account-service, since this service has no User table.
 */
public record MemberResponse(
        Long userId,
        Long inviteId,
        String username,
        String name,
        ProjectRole role,
        Instant invitedAt,
        Instant acceptedAt
) {
    public static MemberResponse pending(Long inviteId, String email, ProjectRole role, Instant invitedAt) {
        return new MemberResponse(null, inviteId, email, null, role, invitedAt, null);
    }
}
