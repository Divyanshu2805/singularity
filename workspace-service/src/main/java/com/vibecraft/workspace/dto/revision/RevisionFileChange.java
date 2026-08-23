package com.vibecraft.workspace.dto.revision;

/**
 * One path's difference between a target revision and the project's current live state - what MID-03's
 * preview-before-restore screen will eventually render.
 */
public record RevisionFileChange(String path, ChangeKind kind) {
    public enum ChangeKind { ADDED, MODIFIED, DELETED }
}
