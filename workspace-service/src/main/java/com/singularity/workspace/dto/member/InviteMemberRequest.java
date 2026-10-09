package com.singularity.workspace.dto.member;

import com.singularity.workspace.enums.ProjectRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Invite someone to a project by email address.
 *
 * <p>Handles: the invitee's email and the role to offer them. Owner is refused by the service - a project has
 * exactly one owner. The field is called username because an account's username is its email address.
 */
public record InviteMemberRequest(

        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address")
        @Size(max = 320, message = "Email must be at most 320 characters")
        String username,

        @NotNull(message = "Role is required")
        ProjectRole role
) {
}
