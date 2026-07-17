package com.vibecraft.common.dto;

import java.util.EnumSet;
import java.util.Set;

/**
 * Wire copy of workspace-service's {@code ProjectRole} vocabulary — workspace-service's own enum stays the
 * source of truth (and the one Hibernate persists), this is only what crosses the wire on its internal
 * project-membership API so other services never need a compile-time dependency on workspace-service's
 * entities. Keep the permission mapping identical to workspace-service's copy if either ever changes.
 */
public enum ProjectRole {
    OWNER,
    EDITOR,
    VIEWER;

    public Set<ProjectPermission> permissions() {
        return switch (this) {
            case OWNER -> EnumSet.allOf(ProjectPermission.class);
            case EDITOR -> EnumSet.of(ProjectPermission.VIEW, ProjectPermission.EDIT,
                    ProjectPermission.DELETE, ProjectPermission.VIEW_MEMBERS);
            case VIEWER -> EnumSet.of(ProjectPermission.VIEW, ProjectPermission.VIEW_MEMBERS);
        };
    }
}
