package com.vibecraft.workspace.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Set;

import static com.vibecraft.workspace.enums.ProjectPermission.*;

/**
 * What a collaborator may do on a project.
 *
 * <p>Handles: the three roles and the permissions each one grants - owner everything, editor everything but member
 * management, viewer read-only.
 *
 * <p>This is the source of truth and the enum Hibernate persists; common-lib carries a wire copy for services that
 * have no membership table of their own, and the two mappings must stay identical.
 */
@RequiredArgsConstructor
@Getter
public enum ProjectRole {

    EDITOR(VIEW, EDIT, DELETE, VIEW_MEMBERS),
    VIEWER(Set.of(VIEW, VIEW_MEMBERS)),
    OWNER(Set.of(VIEW, EDIT, DELETE, MANAGE_MEMBERS, VIEW_MEMBERS));

    ProjectRole(ProjectPermission... permissions) {
        this.permissions = Set.of(permissions);
    }

    private final Set<ProjectPermission> permissions;
}
