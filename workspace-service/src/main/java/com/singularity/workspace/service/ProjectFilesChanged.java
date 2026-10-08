package com.singularity.workspace.service;

/**
 * Says that a project's files may no longer match what its preview is running.
 *
 * <p>Handles: carrying the project's id from wherever the files changed - a published revision, a preview that has
 * just come up - to the listener that brings a running preview level with them.
 *
 * <p>An event rather than a call, so the publisher of a revision does not depend on the preview classes: those
 * already depend on each other in a chain a direct call would close into a cycle.
 */
public record ProjectFilesChanged(Long projectId) {
}
