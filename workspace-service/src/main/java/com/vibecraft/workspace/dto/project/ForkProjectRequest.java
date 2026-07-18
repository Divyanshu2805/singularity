package com.vibecraft.workspace.dto.project;

import jakarta.validation.constraints.Size;

/** @param name what to call the copy; blank or missing means "<original name> (fork)" */
public record ForkProjectRequest(
        @Size(max = 255, message = "Project name should not be more than 255 characters long")
        String name
) {
}
