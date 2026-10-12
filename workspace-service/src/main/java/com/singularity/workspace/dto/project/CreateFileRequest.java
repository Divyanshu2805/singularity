package com.singularity.workspace.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A new, empty file a person adds by hand from the workspace's file panel.
 *
 * <p>Handles: the path of the file to make. It carries no content: the file starts empty and is filled in the
 * editor, by the save every other hand edit uses.
 */
public record CreateFileRequest(
        @NotBlank(message = "A file path is required")
        @Size(max = 400, message = "File path must be at most 400 characters")
        String path
) {
}
