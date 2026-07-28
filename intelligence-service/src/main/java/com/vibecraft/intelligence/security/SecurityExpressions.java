package com.vibecraft.intelligence.security;

import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectPermission;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Backs every permission guard in intelligence-service.
 *
 * <p>Handles: resolving the caller's role on a project over workspace-service's internal API - this service has no
 * membership table of its own - and mapping it to the permission an operation needs. A project that does not exist,
 * or is soft-deleted, denies access.
 *
 * <p>Registered under the same bean name and with the same method names as workspace-service's own copy, so the
 * guards read identically in both services. No permission mapping is duplicated here: the shared wire enum already
 * carries it.
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
            return false;
        }
    }

    public boolean canViewProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.VIEW);
    }

    public boolean canEditProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.EDIT);
    }
}
