package com.singularity.workspace.enums;

/**
 * Whether a project's published app is being served.
 *
 * <p>Handles: the two states a published-app row can be in. LIVE has a build behind its link; UNPUBLISHED keeps the
 * link reserved for the project and serves nothing. A project that was never published has no row at all.
 */
public enum PublishStatus {
    LIVE,
    UNPUBLISHED
}
