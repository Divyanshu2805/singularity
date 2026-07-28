package com.vibecraft.workspace.dto.project;

/**
 * One project file's path and full text.
 *
 * <p>Handles: both, with the path in its canonical stored form.
 */
public record FileContentResponse(
        String path,
        String content
) {
}
