package com.vibecraft.common.dto;

import java.util.List;

/**
 * workspace-service's file tree for one project, as it crosses its internal API.
 *
 * <p>Handles: the path, size and type of every file in a project, so intelligence-service can inject a project's
 * shape into a prompt without touching MinIO or the ProjectFile entity directly.
 */
public record FileTreeDto(
        Long projectId,
        List<Entry> entries
) {
    public record Entry(String path, long size, String type) {
    }
}
