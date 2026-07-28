package com.vibecraft.workspace.service;

import com.vibecraft.workspace.dto.project.CreateProjectFromPromptRequest;
import com.vibecraft.workspace.dto.project.ForkProjectRequest;
import com.vibecraft.workspace.dto.project.ProjectRequest;
import com.vibecraft.workspace.dto.project.ProjectResponse;
import com.vibecraft.workspace.dto.project.ProjectSummaryResponse;

import java.util.List;

/**
 * Projects: creating them, reading them, and everything that changes one.
 *
 * <p>Handles: the caller's project list and one project by id, creating by name or from a typed description,
 * renaming, deleting, forking, retrying starter-template initialisation, and the per-member pin and star flags.
 *
 * <p>Deleting means different things to different people: the owner deletes the project for everyone, while an editor
 * only removes their own membership and the project carries on unchanged for everybody else. Forking copies every
 * file into a new project the caller owns - not the chat, notes or members - and the two are independent from then
 * on.
 */
public interface ProjectService {
    List<ProjectSummaryResponse> getUserProjects();

    ProjectResponse getUserProjectById(Long id);

    ProjectResponse createProject(ProjectRequest request);

    ProjectResponse createProjectFromPrompt(CreateProjectFromPromptRequest request);

    ProjectResponse updateProject(Long id, ProjectRequest request);

    void softDelete(Long id);

    ProjectResponse forkProject(Long id, ForkProjectRequest request);

    ProjectResponse retryTemplateInitialization(Long id);

    void setPinned(Long id, boolean pinned);

    void setStarred(Long id, boolean starred);
}
