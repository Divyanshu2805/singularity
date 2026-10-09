package com.singularity.workspace.service.impl;

import com.singularity.workspace.dto.project.CreateProjectFromPromptRequest;
import com.singularity.workspace.dto.project.ForkProjectRequest;
import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.ForbiddenException;
import com.singularity.workspace.feign.IntelligenceServiceClient;
import com.singularity.workspace.service.PublishService;
import com.singularity.workspace.service.PreviewDeploymentService;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.dto.project.ProjectRequest;
import com.singularity.workspace.util.ProjectNameHeuristic;
import com.singularity.workspace.dto.project.ProjectResponse;
import com.singularity.workspace.dto.project.ProjectSummaryResponse;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.entity.ProjectMemberId;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.mapper.ProjectMapper;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.service.ProjectService;
import com.singularity.workspace.service.ProjectTemplateService;
import com.singularity.workspace.service.TemplateInitResult;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Projects: creating them, reading them, and everything that changes one.
 *
 * <p>Handles: the caller's project list, one project by id, creating by name or from a typed description, renaming,
 * soft-deleting, forking, retrying starter-template initialisation, and the per-member pin and star flags.
 *
 * <p>The plan's project allowance is checked before anything is created, including before naming, so a user at their
 * limit does not waste the call - and it is a 402 rather than a 400, because nothing is wrong with the request. The
 * allowance comes from account-service; the count owned is always local, since memberships are this service's own
 * table.
 *
 * <p>Forking is refused to the owner, who can already change the project however they like, and the fork is deleted
 * again if any file failed to copy - a fork quietly missing files would look like the original and then break
 * inexplicably. Deleting is the owner's for everyone; anyone else's delete only removes their own membership, which
 * is why the method is open to every member and decides by role inside: a viewer has to be able to leave a project
 * they were added to, and only the owner's call ever reaches the line that deletes it.
 *
 * <p>Either shape of delete also revokes standing, not just access: it best-effort stops in-flight AI generation the
 * project or membership can no longer authorize (intelligence-service's own recheck before committing is the actual
 * backstop if that call fails) and stops the preview(s) that lost their reason to keep running. The owner deleting the
 * project also takes its published app down; an editor leaving does not, since the project carries on.
 *
 * <p>The project list carries the link of each project's live published app, looked up in one query for the whole list.
 *
 * <p>Leaving or deleting a project writes its change to the database before it stops anyone's preview. Stopping a
 * preview runs updates that clear the persistence context afterwards, and a change that had only been queued there -
 * the membership row's delete, the project's deleted-at - was thrown away with it, so a project with a preview
 * running could not be deleted or left: the request answered 204 and nothing had changed.
 */
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
@Transactional
@Slf4j
public class ProjectServiceImpl implements ProjectService {

    ProjectRepository projectRepository;
    ProjectMapper projectMapper;
    ProjectMemberRepository projectMemberRepository;
    AuthUtil authUtil;
    ProjectQuota projectQuota;
    ProjectTemplateService projectTemplateService;
    ProjectFileService projectFileService;
    PreviewDeploymentService previewDeploymentService;
    IntelligenceServiceClient intelligenceServiceClient;
    PublishService publishService;

    static final int MAX_NAME_LENGTH = 255;

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public ProjectResponse getUserProjectById(Long id) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        return projectMapper.toProjectResponse(project, getRole(id, userId));
    }

    @Override
    public ProjectResponse createProject(ProjectRequest request) {
        projectQuota.assertCanCreateProject();
        return createOwnedProject(request.name());
    }

    @Override
    public ProjectResponse createProjectFromPrompt(CreateProjectFromPromptRequest request) {
        projectQuota.assertCanCreateProject();
        return createOwnedProject(ProjectNameHeuristic.nameFor(request.prompt()));
    }

    @Override
    @PreAuthorize("@security.canEditProject(#id)")
    public ProjectResponse forkProject(Long id, ForkProjectRequest request) {
        Long userId = authUtil.getCurrentUserId();
        Project source = getAccessibleProjectById(id, userId);
        if (getRole(id, userId) == ProjectRole.OWNER) {
            throw new ForbiddenException("You own this project, so there's nothing to fork - you can already change it however you like.");
        }
        projectQuota.assertCanCreateProject();

        String requested = request == null || request.name() == null ? "" : request.name().strip();
        String name = requested.isEmpty() ? source.getName() + " (fork)" : requested;
        if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH).strip();

        Project fork = saveProjectWithOwner(name, userId, source.getId());
        int failed = projectFileService.copyAllFiles(source.getId(), fork.getId());
        if (failed > 0) {
            fork.setDeletedAt(Instant.now());
            projectRepository.save(fork);
            throw new FileStorageException("Couldn't copy " + failed + " file(s) while forking project " + id, null);
        }

        log.info("User {} forked project {} into project {}", userId, id, fork.getId());
        return projectMapper.toProjectResponse(fork, ProjectRole.OWNER);
    }

    private Project saveProjectWithOwner(String name, Long userId, Long forkedFromProjectId) {
        Project project = projectRepository.save(Project.builder()
                .name(name)
                .isPublic(false)
                .forkedFromProjectId(forkedFromProjectId)
                .build());

        projectMemberRepository.save(ProjectMember.builder()
                .id(new ProjectMemberId(project.getId(), userId))
                .projectRole(ProjectRole.OWNER)
                .acceptedAt(Instant.now())
                .invitedAt(Instant.now())
                .project(project)
                .build());

        return project;
    }

    private ProjectResponse createOwnedProject(String name) {
        Long userId = authUtil.getCurrentUserId();
        Project project = saveProjectWithOwner(name, userId, null);

        TemplateInitResult templateResult;
        try {
            templateResult = projectTemplateService.initializeProjectFromTemplate(project.getId());
        } catch (Exception e) {
            log.error("Unexpected error during template initialization for project {}", project.getId(), e);
            templateResult = new TemplateInitResult(0, 0, List.of("(template initialization failed unexpectedly)"));
        }

        if (!templateResult.isComplete()) {
            project.setTemplateInitIssue(describeIncompleteTemplate(templateResult));
            project = projectRepository.save(project);
        }

        return projectMapper.toProjectResponse(project, ProjectRole.OWNER);
    }

    @Override
    public List<ProjectSummaryResponse> getUserProjects() {

        Long userId = authUtil.getCurrentUserId();
        var projects = projectRepository.findAllAccessibleByUser(userId);

        Map<Long, ProjectMember> membershipsByProjectId = projectMemberRepository.findByIdUserId(userId).stream()
                .collect(Collectors.toMap(pm -> pm.getId().getProjectId(), Function.identity()));

        Map<Long, String> publishedUrls = publishService.liveUrls(projects.stream().map(Project::getId).toList());

        return projects.stream()
                .map(project -> {
                    ProjectMember membership = membershipsByProjectId.get(project.getId());
                    return projectMapper.toProjectSummaryResponse(project, membership.getProjectRole(),
                            membership.getPinnedAt(), membership.getStarredAt(), publishedUrls.get(project.getId()));
                })
                .toList();
    }

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public void setPinned(Long id, boolean pinned) {
        ProjectMember membership = getCurrentUserMembership(id);
        if (pinned == (membership.getPinnedAt() != null)) {
            return;
        }
        membership.setPinnedAt(pinned ? Instant.now() : null);
        projectMemberRepository.save(membership);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public void setStarred(Long id, boolean starred) {
        ProjectMember membership = getCurrentUserMembership(id);
        if (starred == (membership.getStarredAt() != null)) {
            return;
        }
        membership.setStarredAt(starred ? Instant.now() : null);
        projectMemberRepository.save(membership);
    }

    private ProjectMember getCurrentUserMembership(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        getAccessibleProjectById(projectId, userId);
        return projectMemberRepository.findById(new ProjectMemberId(projectId, userId))
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", projectId + "/" + userId));
    }

    @Override
    @PreAuthorize("@security.canEditProject(#id)")
    public ProjectResponse updateProject(Long id, ProjectRequest request) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        project.setName(request.name());

        project = projectRepository.save(project);

        return projectMapper.toProjectResponse(project, getRole(id, userId));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public void softDelete(Long id) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        if (getRole(id, userId) != ProjectRole.OWNER) {
            projectMemberRepository.deleteById(new ProjectMemberId(id, userId));
            projectMemberRepository.flush();
            log.info("User {} removed project {} from their projects (left as a non-owner)", userId, id);
            revokeOngoingWork(id, userId);
            previewDeploymentService.endSessionForUser(id, userId, "No longer a member of this project");
            return;
        }

        project.setDeletedAt(Instant.now());
        projectRepository.save(project);
        projectRepository.flush();
        log.info("Owner {} deleted project {} for all its members", userId, id);

        revokeOngoingWork(id, null);
        previewDeploymentService.stopAllForProject(id, "The project was deleted");
        publishService.takeDown(id);
    }

    /**
     * Best-effort: stops in-flight AI generation the deleted project or removed member can no longer authorize, so
     * it doesn't keep running toward a commit intelligence-service's own recheck would discard anyway. A null
     * userId (project deletion) stops every generation running against the project; a specific one (member removal)
     * stops only theirs. Never blocks or fails the delete/removal itself - intelligence-service being unreachable
     * here just means a running generation finishes on its own and is discarded by that recheck instead.
     */
    private void revokeOngoingWork(Long projectId, Long userId) {
        try {
            intelligenceServiceClient.stopGeneration(projectId, userId);
        } catch (Exception e) {
            log.warn("Couldn't ask intelligence-service to stop generation for projectId: {}, userId: {} - " +
                    "any in-flight response will still be denied when it tries to commit.", projectId, userId, e);
        }
    }

    public Project getAccessibleProjectById(Long projectId, Long userId) {

        return projectRepository.findAccessibleProjectById(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }

    @Override
    @PreAuthorize("@security.canEditProject(#id)")
    public ProjectResponse retryTemplateInitialization(Long id) {
        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        TemplateInitResult result = projectTemplateService.initializeProjectFromTemplate(id);

        project.setTemplateInitIssue(result.isComplete() ? null : describeIncompleteTemplate(result));
        project = projectRepository.save(project);

        return projectMapper.toProjectResponse(project, getRole(id, userId));
    }

    private ProjectRole getRole(Long projectId, Long userId) {
        return projectMemberRepository.findRoleByProjectIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", projectId + "/" + userId));
    }

    private String describeIncompleteTemplate(TemplateInitResult result) {
        if (result.copiedCount() == 0 && result.skippedCount() == 0) {
            return "Template initialization failed: the starter template storage was unreachable, " +
                    "so no files could be created.";
        }
        return "Template initialization incomplete: " + result.failedPaths().size()
                + " file(s) could not be created (" + String.join(", ", result.failedPaths()) + ").";
    }
}
