package com.vibecraft.common.dto;

/**
 * The answer to "does this user have a role on this project, and what is it" — served by
 * workspace-service's internal API and consumed by every other service's {@code @PreAuthorize} checks
 * (e.g. intelligence-service's {@code SecurityExpressions} equivalent). {@code role == null} means the
 * user is not a member at all.
 */
public record ProjectMembershipDto(
        Long projectId,
        Long userId,
        ProjectRole role
) {
}
