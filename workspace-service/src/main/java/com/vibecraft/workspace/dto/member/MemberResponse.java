package com.vibecraft.workspace.dto.member;

import com.vibecraft.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * One collaborator on a project.
 *
 * <p>Handles: their id, email and display name, their role, and when they were invited and accepted.
 *
 * <p>The name and email are not stored here: they come from account-service, since this service has no User table.
 */
public record MemberResponse(
        Long userId,
        String username,
        String name,
        ProjectRole role,
        Instant invitedAt,
        Instant acceptedAt
) {
}
