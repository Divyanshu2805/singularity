package com.vibecraft.common.dto;

/**
 * workspace-service's minimal view of a project, as it crosses its internal API.
 *
 * <p>Handles: enough of a project - id, name, visibility, whether it is soft-deleted, and any template-initialisation
 * problem - for another service to attribute usage or head a chat without owning the Project entity.
 */
public record ProjectSummaryDto(
        Long id,
        String name,
        boolean isPublic,
        boolean deleted,
        String templateInitIssue
) {
}
