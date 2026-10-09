package com.singularity.workspace.enums;

/**
 * The individual capabilities a project role grants.
 *
 * <p>Handles: naming each one. Roles map to sets of these (ProjectRole), and SecurityExpressions asks for them by
 * constant; nothing reads a string form of a permission. PUBLISH - put the app online at a public link, take it down,
 * share its code - is held by the owner alone.
 */
public enum ProjectPermission {

    VIEW,
    EDIT,
    DELETE,

    MANAGE_MEMBERS,
    VIEW_MEMBERS,

    PUBLISH
}
