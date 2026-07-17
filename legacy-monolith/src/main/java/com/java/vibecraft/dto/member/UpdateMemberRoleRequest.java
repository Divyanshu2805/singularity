package com.java.vibecraft.dto.member;

import com.java.vibecraft.enums.ProjectRole;
import jakarta.validation.constraints.NotNull;

public record UpdateMemberRoleRequest(
        @NotNull(message = "Role is required")
        ProjectRole role
) {
}
