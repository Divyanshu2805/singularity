package com.vibecraft.common.dto;

/**
 * workspace-service's minimal view of a project, as served over its internal API — enough for
 * intelligence-service to render a usage-insights breakdown or a chat context header without owning
 * {@code Project} itself.
 */
public record ProjectSummaryDto(
        Long id,
        String name,
        boolean isPublic
) {
}
