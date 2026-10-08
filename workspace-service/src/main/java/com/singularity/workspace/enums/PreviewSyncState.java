package com.singularity.workspace.enums;

/**
 * Whether a running preview is showing the project's current files.
 *
 * <p>Handles: naming the two answers - it is, or a newer change is still on its way into the runner.
 *
 * <p>Computed for each response from the revision the runner was last brought up to and the project's current one;
 * it is not a column.
 */
public enum PreviewSyncState {
    UP_TO_DATE, UPDATING
}
