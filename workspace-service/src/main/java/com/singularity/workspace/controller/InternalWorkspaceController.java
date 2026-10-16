package com.singularity.workspace.controller;

import com.singularity.common.dto.CodeCheckRequest;
import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.common.dto.DeleteUserDataRequest;
import com.singularity.common.dto.FileContentDto;
import com.singularity.common.dto.FileTreeDto;
import com.singularity.common.dto.ProjectMembershipDto;
import com.singularity.common.dto.ProjectRole;
import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.common.dto.ProjectTitleDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.CodeCheckService;
import com.singularity.workspace.service.PreviewDeploymentService;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.ProjectService;
import com.singularity.workspace.service.RevisionPublisher;
import com.singularity.workspace.service.UserDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * workspace-service's API for the other services, not the browser.
 *
 * <p>Handles: the membership lookup behind every cross-service permission check, project summaries singly and in
 * batch, the file tree and file content that AI prompts and code insight read, the atomic revision publish a
 * generated turn commits through (CODE_REVIEW.md AI-05), the type-check of a turn's files in the project's running
 * preview before they are saved, giving a project with no title the one a model wrote for it, and the two counts the
 * usage meter shows - projects owned and previews running - removing everything of an account account-service is
 * deleting, and making the shared demo account's sample project for its daily reset.
 *
 * <p>Guarded by the shared internal-service secret rather than a caller's permissions, exactly like account-service's
 * equivalent: the caller is intelligence-service acting on a request it has already authorized itself. These
 * endpoints therefore enforce no per-project permission of their own, which is why the shared secret - and the
 * distinct authority it grants - is what keeps an end user's session cookie out.
 *
 * <p>The membership endpoint returns a null role for "not a member" and 404s only when the project itself does not
 * exist or is soft-deleted; the caller's permission check depends on telling those two apart. Project summaries are
 * the one place deleted projects are included, so usage insights can still attribute tokens spent before a delete.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalWorkspaceController {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectFileService projectFileService;
    private final PreviewDeploymentService previewDeploymentService;
    private final RevisionPublisher revisionPublisher;
    private final CodeCheckService codeCheckService;
    private final ProjectService projectService;
    private final UserDataService userDataService;

    @GetMapping("/projects/{projectId}/members/{userId}")
    public ProjectMembershipDto getMembership(@PathVariable Long projectId, @PathVariable Long userId) {
        assertProjectExists(projectId);
        ProjectRole role = projectMemberRepository.findRoleByProjectIdAndUserId(projectId, userId)
                .map(r -> ProjectRole.valueOf(r.name()))
                .orElse(null);
        return new ProjectMembershipDto(projectId, userId, role);
    }

    @GetMapping("/projects/{projectId}")
    public ProjectSummaryDto getProjectSummary(@PathVariable Long projectId) {
        Project project = assertProjectExists(projectId);
        return toSummaryDto(project);
    }

    @GetMapping("/projects")
    public List<ProjectSummaryDto> getProjectSummaries(@RequestParam List<Long> ids) {
        return projectRepository.findAllById(ids).stream().map(this::toSummaryDto).toList();
    }

    @GetMapping("/projects/{projectId}/files")
    public FileTreeDto getFileTree(@PathVariable Long projectId) {
        assertProjectExists(projectId);
        var entries = projectFileRepository.findByProjectId(projectId).stream()
                .map(f -> new FileTreeDto.Entry(f.getPath(), f.getSize() == null ? 0 : f.getSize(), f.getType()))
                .toList();
        return new FileTreeDto(projectId, entries);
    }

    @GetMapping("/projects/{projectId}/files/content")
    public FileContentDto getFileContent(@PathVariable Long projectId, @RequestParam String path) {
        var response = projectFileService.getFileContent(projectId, path);
        return new FileContentDto(response.path(), response.content());
    }

    @PostMapping("/projects/{projectId}/revisions")
    public PublishRevisionResponse publishRevision(@PathVariable Long projectId, @RequestBody PublishRevisionRequest request) {
        return revisionPublisher.publish(projectId, request);
    }

    @PostMapping("/projects/{projectId}/code-check")
    public CodeCheckResponse checkCode(@PathVariable Long projectId, @RequestBody CodeCheckRequest request) {
        assertProjectExists(projectId);
        return codeCheckService.check(projectId, request);
    }

    @PutMapping("/projects/{projectId}/title")
    public ProjectTitleDto titleProject(@PathVariable Long projectId, @RequestBody ProjectTitleDto request) {
        assertProjectExists(projectId);
        return new ProjectTitleDto(projectService.titleIfUntitled(projectId, request.title()));
    }

    @PostMapping("/users/{userId}/delete-data")
    public void deleteUserData(@PathVariable Long userId, @RequestBody DeleteUserDataRequest request) {
        userDataService.deleteAllFor(userId, request.email());
    }

    @PostMapping("/users/{userId}/demo-project")
    public ProjectSummaryDto createDemoProject(@PathVariable Long userId, @RequestBody ProjectTitleDto request) {
        Long projectId = projectService.createDemoProject(userId, request.title());
        return toSummaryDto(projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString())));
    }

    @GetMapping("/projects/owned-count")
    public int getOwnedProjectCount(@RequestParam Long userId) {
        return projectMemberRepository.countProjectOwnedByUser(userId);
    }

    @GetMapping("/previews/running-count")
    public int getRunningPreviewCount(@RequestParam Long userId) {
        return previewDeploymentService.countActivePreviews(userId);
    }

    private ProjectSummaryDto toSummaryDto(Project project) {
        return new ProjectSummaryDto(project.getId(), project.getName(), Boolean.TRUE.equals(project.getIsPublic()),
                project.getDeletedAt() != null, project.getTemplateInitIssue(), project.getSummary());
    }

    private Project assertProjectExists(Long projectId) {
        return projectRepository.findById(projectId)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }
}
