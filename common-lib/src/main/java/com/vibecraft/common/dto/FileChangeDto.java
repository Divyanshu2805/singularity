package com.vibecraft.common.dto;

/**
 * One path's change within a revision publish request.
 *
 * <p>Handles: carrying either a file's new full content (EDIT) or a bare path to remove (DELETE) - the unit a
 * {@link PublishRevisionRequest} is a list of. {@code content} is null for DELETE.
 */
public record FileChangeDto(
        String path,
        ChangeType changeType,
        String content
) {
    public enum ChangeType { EDIT, DELETE }
}
