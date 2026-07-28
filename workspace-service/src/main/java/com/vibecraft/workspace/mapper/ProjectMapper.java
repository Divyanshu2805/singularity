package com.vibecraft.workspace.mapper;

import com.vibecraft.workspace.dto.project.ProjectResponse;
import com.vibecraft.workspace.dto.project.ProjectSummaryResponse;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.enums.ProjectRole;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.time.Instant;

/**
 * Turns project rows into the shapes the app reads.
 *
 * <p>Handles: the full project response and the dashboard summary, each taking the caller's role - and the summary
 * their pin and star markers - alongside the row, since those are per-member rather than per-project.
 */
@Mapper(componentModel = "spring")
public interface ProjectMapper {

    @Mapping(target = "role", source = "role")
    ProjectResponse toProjectResponse(Project project, ProjectRole role);

    @Mapping(target = "role", source = "role")
    @Mapping(target = "pinnedAt", source = "pinnedAt")
    @Mapping(target = "starredAt", source = "starredAt")
    ProjectSummaryResponse toProjectSummaryResponse(Project project, ProjectRole role, Instant pinnedAt, Instant starredAt);
}
