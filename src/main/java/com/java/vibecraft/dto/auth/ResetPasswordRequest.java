package com.java.vibecraft.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(

        @NotBlank(message = "Reset token is required")
        @Size(max = 128, message = "Reset token is invalid")
        String token,

        @NotBlank(message = "Password is required")
        @Size(min = 8, message = "Password must be at least 8 characters long")
        String newPassword
) {
}
