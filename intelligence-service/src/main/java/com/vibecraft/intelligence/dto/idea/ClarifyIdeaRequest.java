package com.vibecraft.intelligence.dto.idea;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ClarifyIdeaRequest(

        @NotBlank(message = "Describe what you want to build")
        @Size(max = 4000, message = "Idea should not be more than 4000 characters long")
        String idea
) {
}
