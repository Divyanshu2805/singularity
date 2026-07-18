package com.vibecraft.intelligence.security;

import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectPermission;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Reimplements what {@code @security.canViewProject}/{@code canEditProject} already mean elsewhere in this
 * codebase, backed by a Feign call instead of a local {@code ProjectMemberRepository} query - intelligence-
 * service has no such table, {@code ProjectMember} lives in workspace-service's database. Bean name and
 * method names stay identical to every prior copy so every existing {@code @PreAuthorize("@security.canX(...)")}
 * string in the ported service classes keeps working unchanged. No permission-mapping logic is duplicated
 * here: common-lib's wire {@code ProjectRole.permissions()} already carries the same mapping the JPA-backed
 * enum has.
 */
@Component("security")
@RequiredArgsConstructor
public class SecurityExpressions {

    private final WorkspaceServiceClient workspaceServiceClient;
    private final AuthUtil authUtil;

    private boolean hasPermission(Long projectId, ProjectPermission permission) {
        Long userId = authUtil.getCurrentUserId();
        try {
            ProjectMembershipDto membership = workspaceServiceClient.getMembership(projectId, userId);
            return membership.role() != null && membership.role().permissions().contains(permission);
        } catch (FeignException.NotFound e) {
            return false; // the project itself doesn't exist (or is soft-deleted)
        }
    }

    public boolean canViewProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.VIEW);
    }

    public boolean canEditProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.EDIT);
    }
}
