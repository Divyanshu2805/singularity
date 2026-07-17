package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.project.ProjectResponse;
import com.java.vibecraft.dto.project.ProjectSummaryResponse;
import com.java.vibecraft.entity.Project;
import com.java.vibecraft.enums.ProjectRole;
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
