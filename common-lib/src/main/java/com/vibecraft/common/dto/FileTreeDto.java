package com.vibecraft.common.dto;

import java.util.List;

/**
 * workspace-service's file tree for one project, as served over its internal API — what
 * {@code FileTreeContextAdvisor} and the AI generation pipeline in intelligence-service inject into a
 * prompt without ever touching MinIO or {@code ProjectFile} directly.
 */
public record FileTreeDto(
        Long projectId,
        List<Entry> entries
) {
    public record Entry(String path, long size, String type) {
    }
}
