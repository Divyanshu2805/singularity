package com.vibecraft.common.dto;

/**
 * The answer to "does this user have a role on this project, and which".
 *
 * <p>Handles: the membership lookup behind every cross-service @PreAuthorize check. A null role means the user is not
 * a member at all, which is distinct from the project not existing - that is a 404 from the endpoint instead.
 */
public record ProjectMembershipDto(
        Long projectId,
        Long userId,
        ProjectRole role
) {
}
