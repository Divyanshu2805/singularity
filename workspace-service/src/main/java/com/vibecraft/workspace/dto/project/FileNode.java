package com.vibecraft.workspace.dto.project;

import java.time.Instant;

/**
 * One entry in a project's file tree.
 *
 * <p>Handles: the path, when it last changed, its size and its content type.
 */
public record FileNode(
        String path,
        Instant modifiedAt,
        Long size,
        String type
) {
}
