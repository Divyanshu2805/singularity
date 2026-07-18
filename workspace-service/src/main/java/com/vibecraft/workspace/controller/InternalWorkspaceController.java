package com.vibecraft.workspace.controller;

import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectRole;
import com.vibecraft.common.dto.ProjectSummaryDto;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * workspace-service's API for the other services, not the browser - never routed through gateway-service, and
 * guarded by common-lib's {@code InternalServiceAuthFilter} (a shared secret) rather than {@code @PreAuthorize},
 * exactly like account-service's {@code InternalAccountController}. Not yet called by anything: intelligence-
 * service doesn't exist yet (see docs/migration/phase-2-workspace-service.md's Phase 2 entry) - built now, same rationale account-
 * service's own internal API was.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalWorkspaceController {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectFileRepository projectFileRepository;

    /**
     * {@code role == null} means "not a member" - see {@link ProjectMembershipDto}'s own javadoc - so this never
     * 404s for a real project with no such member; it 404s only if the project itself doesn't exist (or is
     * soft-deleted). A future intelligence-service {@code @security} bean's {@code @PreAuthorize} check depends
     * on evaluating that distinction correctly, not on an exception either way.
     */
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
        return new ProjectSummaryDto(project.getId(), project.getName(), Boolean.TRUE.equals(project.getIsPublic()));
    }

    @GetMapping("/projects/{projectId}/files")
    public FileTreeDto getFileTree(@PathVariable Long projectId) {
        assertProjectExists(projectId);
        var entries = projectFileRepository.findByProjectId(projectId).stream()
                .map(f -> new FileTreeDto.Entry(f.getPath(), f.getSize() == null ? 0 : f.getSize(), f.getType()))
                .toList();
        return new FileTreeDto(projectId, entries);
    }

    private Project assertProjectExists(Long projectId) {
        return projectRepository.findById(projectId)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }
}
