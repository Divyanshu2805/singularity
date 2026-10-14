package com.singularity.common.dto;

/**
 * workspace-service's minimal view of a project, as it crosses its internal API.
 *
 * <p>Handles: enough of a project - id, name, visibility, whether it is soft-deleted, any template-initialisation
 * problem, and its title (null while it has none) - for another service to attribute usage, head a chat or tell
 * whether a title is still owed, without owning the Project entity.
 */
public record ProjectSummaryDto(
        Long id,
        String name,
        boolean isPublic,
        boolean deleted,
        String templateInitIssue,
        String title
) {
}
