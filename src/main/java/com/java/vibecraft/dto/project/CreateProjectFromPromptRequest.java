package com.java.vibecraft.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateProjectFromPromptRequest(

        @NotBlank(message = "Describe what you want to build")
        @Size(max = 4000, message = "Project description should not be more than 4000 characters long")
        String prompt
) {
}
