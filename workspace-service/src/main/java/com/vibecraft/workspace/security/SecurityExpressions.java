package com.vibecraft.workspace.security;

import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.workspace.enums.ProjectPermission;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Backs every permission guard in workspace-service.
 *
 * <p>Handles: resolving the caller's role on a project and mapping it to the permission a given operation needs -
 * view, edit, delete, and the two member-management permissions. A caller with no membership, or a membership on a
 * soft-deleted project, has no permissions at all.
 *
 * <p>Registered under the bean name the authorization expressions refer to. The expression's argument name must match
 * the guarded method's parameter name exactly; a mismatch evaluates to null and silently denies everyone.
 */
@Component("security")
@RequiredArgsConstructor
public class SecurityExpressions {

    private final ProjectMemberRepository projectMemberRepository;
    private final AuthUtil authUtil;

    private boolean hasPermission(Long projectId, ProjectPermission projectPermission) {
        Long userId = authUtil.getCurrentUserId();
        return projectMemberRepository.findRoleByProjectIdAndUserId(projectId, userId)
                .map(role -> role.getPermissions().contains(projectPermission))
                .orElse(false);
    }

    public boolean canViewProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.VIEW);
    }

    public boolean canEditProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.EDIT);
    }

    public boolean canDeleteProject(Long projectId) {
        return hasPermission(projectId, ProjectPermission.DELETE);
    }

    public boolean canViewMembers(Long projectId) {
        return hasPermission(projectId, ProjectPermission.VIEW_MEMBERS);
    }

    public boolean canManageMembers(Long projectId) {
        return hasPermission(projectId, ProjectPermission.MANAGE_MEMBERS);
    }
}
