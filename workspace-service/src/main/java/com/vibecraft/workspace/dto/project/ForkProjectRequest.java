package com.vibecraft.workspace.dto.project;

import jakarta.validation.constraints.Size;

/**
 * What to call a fork.
 *
 * <p>Handles: an optional name; blank or missing means the original's name with "(fork)" appended.
 */
public record ForkProjectRequest(
        @Size(max = 255, message = "Project name should not be more than 255 characters long")
        String name
) {
}
