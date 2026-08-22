package com.vibecraft.workspace.enums;

/**
 * What produced a revision.
 *
 * <p>Handles: distinguishing an AI generation turn from a (future) manual edit and from a restore - a restore is not
 * a special code path, it publishes through the same mechanism as any other writer, tagged so history shows why the
 * project moved to that state.
 */
public enum RevisionSource {
    AI_GENERATION,
    MANUAL_EDIT,
    RESTORE
}
