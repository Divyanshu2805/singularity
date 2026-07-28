package com.vibecraft.workspace.service;

import java.util.List;

/**
 * What a starter-template initialisation actually managed to do.
 *
 * <p>Handles: how many files were copied, how many were already there, and the paths of any that could not be created
 * - which is what makes the attempt complete or not.
 */
public record TemplateInitResult(int copiedCount, int skippedCount, List<String> failedPaths) {
    public boolean isComplete() {
        return failedPaths.isEmpty();
    }
}
