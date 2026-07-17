package com.vibecraft.account.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateSessionRequest(

        @NotBlank(message = "ID token is required")
        @Size(max = 8192, message = "ID token is too long")
        String idToken
) {
}
