package com.vibecraft.common.dto;

/**
 * Wire copy of workspace-service's permission vocabulary.
 *
 * <p>Handles: naming the individual capabilities a role grants, so a service without workspace-service's entities can
 * still evaluate a permission. See ProjectRole for the mapping and for why this copy exists.
 */
public enum ProjectPermission {
    VIEW,
    EDIT,
    DELETE,
    MANAGE_MEMBERS,
    VIEW_MEMBERS
}
