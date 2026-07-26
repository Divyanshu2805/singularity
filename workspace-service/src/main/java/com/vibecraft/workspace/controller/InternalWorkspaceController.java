package com.vibecraft.workspace.controller;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectRole;
import com.vibecraft.common.dto.ProjectSummaryDto;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import com.vibecraft.workspace.service.ProjectFileService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * workspace-service's API for the other services, not the browser.
 *
 * <p>Handles: the membership lookup behind every cross-service permission check, project summaries singly and in
 * batch, the file tree and file content that AI prompts and code insight read, the file writes and deletes a
 * generated turn lands, and the two counts the usage meter shows - projects owned and previews running.
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

    @PostMapping("/projects/{projectId}/files")
    public void saveFile(@PathVariable Long projectId, @RequestBody FileContentDto request) {
        projectFileService.saveFile(projectId, request.path(), request.content());
    }

    @DeleteMapping("/projects/{projectId}/files")
    public void deleteFile(@PathVariable Long projectId, @RequestParam String path) {
        projectFileService.deleteFile(projectId, path);
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
                project.getDeletedAt() != null, project.getTemplateInitIssue());
    }

    private Project assertProjectExists(Long projectId) {
        return projectRepository.findById(projectId)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }
}
