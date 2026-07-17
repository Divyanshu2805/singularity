package com.java.vibecraft.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid username address")
        String username,

        @NotBlank(message = "Name is required")
        @Size(min = 1, max = 30, message = "Name must be between 1 and 30 characters")
        String name,

        @NotBlank(message = "Password is required")
        @Size(min = 8, message = "Password must be at least 8 characters long")
        String password
) {
}
