package com.singularity.workspace.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create a project from a typed description of what to build.
 *
 * <p>Handles: that description, bounded in length, and - when the idea interview's model supplied them - what to call
 * the app and a line saying what it is. Both are suggestions: the service cuts the name to two words and the line to
 * eight, and makes its own from the description when either is missing, so a project can always be created with no
 * AI call at all.
 */
public record CreateProjectFromPromptRequest(

        @NotBlank(message = "Describe what you want to build")
        @Size(max = 4000, message = "Project description should not be more than 4000 characters long")
        String prompt,

        @Size(max = 80, message = "A project name should not be more than 80 characters long")
        String name,

        @Size(max = 200, message = "A project summary should not be more than 200 characters long")
        String summary
) {
}
