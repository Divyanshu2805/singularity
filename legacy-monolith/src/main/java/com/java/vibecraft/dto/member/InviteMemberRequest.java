package com.java.vibecraft.dto.member;

import com.java.vibecraft.enums.ProjectRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record InviteMemberRequest(

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid username address")
        String username,

        @NotNull(message = "Role is required")
        ProjectRole role
) {
}
