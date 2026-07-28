package com.vibecraft.workspace.dto.member;

import com.vibecraft.workspace.enums.ProjectRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Invite someone to a project by email address.
 *
 * <p>Handles: the invitee's email and the role to give them. Owner is refused by the service - a project has exactly
 * one owner.
 */
public record InviteMemberRequest(

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid username address")
        String username,

        @NotNull(message = "Role is required")
        ProjectRole role
) {
}
