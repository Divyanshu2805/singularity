package com.vibecraft.workspace.mapper;

import com.vibecraft.workspace.dto.project.ProjectResponse;
import com.vibecraft.workspace.dto.project.ProjectSummaryResponse;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.enums.ProjectRole;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.time.Instant;

@Mapper(componentModel = "spring")
public interface ProjectMapper {

    @Mapping(target = "role", source = "role")
    ProjectResponse toProjectResponse(Project project, ProjectRole role);

    @Mapping(target = "role", source = "role")
    @Mapping(target = "pinnedAt", source = "pinnedAt")
    @Mapping(target = "starredAt", source = "starredAt")
    ProjectSummaryResponse toProjectSummaryResponse(Project project, ProjectRole role, Instant pinnedAt, Instant starredAt);
}
