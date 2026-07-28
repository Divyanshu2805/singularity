package com.vibecraft.workspace.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create or rename a project.
 *
 * <p>Handles: the name, bounded to the column's own limit.
 */
public record ProjectRequest(

        @NotBlank(message = "Project name is required")
        @Size(max = 255, message = "Project name should not be more than 255 characters long")
        String name
) {
}
