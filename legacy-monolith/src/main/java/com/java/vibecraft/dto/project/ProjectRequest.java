package com.java.vibecraft.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectRequest(

        @NotBlank(message = "Project name is required")
        @Size(max = 255, message = "Project name should not be more than 255 characters long")
        String name
) {
}
