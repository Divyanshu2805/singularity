package com.vibecraft.workspace.service;

import com.vibecraft.workspace.dto.project.CreateProjectFromPromptRequest;
import com.vibecraft.workspace.dto.project.ForkProjectRequest;
import com.vibecraft.workspace.dto.project.ProjectRequest;
import com.vibecraft.workspace.dto.project.ProjectResponse;
import com.vibecraft.workspace.dto.project.ProjectSummaryResponse;

import java.util.List;

public interface ProjectService {
    List<ProjectSummaryResponse> getUserProjects();

    ProjectResponse getUserProjectById(Long id);

    ProjectResponse createProject(ProjectRequest request);

    ProjectResponse createProjectFromPrompt(CreateProjectFromPromptRequest request);

    ProjectResponse updateProject(Long id, ProjectRequest request);

    /**
     * "Delete" means something different depending on who asks. The owner deletes the project for everyone - owner,
     * editors and viewers all lose it. An editor only removes it for themselves: their membership goes, and the owner
     * and everyone else keep the project exactly as it was.
     */
    void softDelete(Long id);

    /**
     * Copies a project the caller can edit (as an editor - owners are refused with a 403) into a new project they own: every file, but not the chat, notes or
     * members. From then on the two are independent - changes to either never reach the other.
     */
    ProjectResponse forkProject(Long id, ForkProjectRequest request);

    ProjectResponse retryTemplateInitialization(Long id);

    void setPinned(Long id, boolean pinned);

    void setStarred(Long id, boolean starred);
}
