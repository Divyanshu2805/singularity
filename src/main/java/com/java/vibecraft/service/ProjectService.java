package com.java.vibecraft.service;

import com.java.vibecraft.dto.project.CreateProjectFromPromptRequest;
import com.java.vibecraft.dto.project.ProjectRequest;
import com.java.vibecraft.dto.project.ProjectResponse;
import com.java.vibecraft.dto.project.ProjectSummaryResponse;

import java.util.List;

public interface ProjectService {
    List<ProjectSummaryResponse> getUserProjects();

    ProjectResponse getUserProjectById(Long id);

    ProjectResponse createProject(ProjectRequest request);

    ProjectResponse createProjectFromPrompt(CreateProjectFromPromptRequest request);

    ProjectResponse updateProject(Long id, ProjectRequest request);

    void softDelete(Long id);

    ProjectResponse retryTemplateInitialization(Long id);

    void setPinned(Long id, boolean pinned);

    void setStarred(Long id, boolean starred);
}
