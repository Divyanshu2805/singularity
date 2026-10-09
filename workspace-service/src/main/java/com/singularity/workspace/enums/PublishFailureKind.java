package com.singularity.workspace.enums;

/**
 * What a failed publish died of, which decides what the person is told to do.
 *
 * <p>Handles: INSTALL (package.json cannot be installed), BUILD (the project's own code does not build), NO_OUTPUT (it
 * built but left no page to serve), TOO_LARGE (the sources or the build are over the limits), TIMEOUT (a step ran out
 * of time), CAPACITY (no runner came free) and PLATFORM (the cluster, storage or the service failed - worth trying
 * again unchanged). Only PLATFORM and CAPACITY are not the project's fault.
 */
public enum PublishFailureKind {
    INSTALL,
    BUILD,
    NO_OUTPUT,
    TOO_LARGE,
    TIMEOUT,
    CAPACITY,
    PLATFORM
}
