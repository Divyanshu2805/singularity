package com.vibecraft.workspace.dto.member;

import com.vibecraft.workspace.enums.ProjectRole;
import jakarta.validation.constraints.NotNull;

/**
 * Change a collaborator's role.
 *
 * <p>Handles: the new role. Granting or removing owner is refused by the service.
 */
public record UpdateMemberRoleRequest(
        @NotNull(message = "Role is required")
        ProjectRole role
) {
}
