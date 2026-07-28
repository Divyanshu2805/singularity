package com.vibecraft.workspace.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create a project from a typed description of what to build.
 *
 * <p>Handles: that description, bounded in length. The name is derived from it by a deterministic heuristic, with no
 * AI call.
 */
public record CreateProjectFromPromptRequest(

        @NotBlank(message = "Describe what you want to build")
        @Size(max = 4000, message = "Project description should not be more than 4000 characters long")
        String prompt
) {
}
