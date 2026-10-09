package com.singularity.workspace.enums;

/**
 * Where a published app's latest build stands.
 *
 * <p>Handles: BUILDING while a runner is making the build, FAILED once it could not be made and until the next attempt
 * starts. Null on the row means no build is under way and the last one succeeded (or none ever started).
 */
public enum PublishBuildStatus {
    BUILDING,
    FAILED
}
