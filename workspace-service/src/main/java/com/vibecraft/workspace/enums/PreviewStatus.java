package com.vibecraft.workspace.enums;

/**
 * The states a live preview passes through.
 *
 * <p>Handles: naming them - starting, running, failed to start, and ended.
 *
 * <p>Unlike this codebase's other enum columns, the previews table carries a database check constraint listing
 * exactly these values, so adding a status means dropping that constraint in a migration first.
 */
public enum PreviewStatus {
    CREATING, RUNNING, FAILED, TERMINATED
}
