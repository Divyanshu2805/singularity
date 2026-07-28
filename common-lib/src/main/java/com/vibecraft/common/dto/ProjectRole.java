package com.vibecraft.common.dto;

import java.util.EnumSet;
import java.util.Set;

/**
 * Wire copy of workspace-service's project-role vocabulary, with the permissions each role grants.
 *
 * <p>Handles: letting any service decide what a role may do without a compile-time dependency on workspace-service's
 * entities. workspace-service's own enum stays the source of truth and is the one Hibernate persists; this is only
 * what crosses its internal API. Keep the two permission mappings identical if either changes.
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
