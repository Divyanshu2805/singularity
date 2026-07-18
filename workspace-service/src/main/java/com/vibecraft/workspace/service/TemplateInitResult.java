package com.vibecraft.workspace.service;

import java.util.List;

public record TemplateInitResult(int copiedCount, int skippedCount, List<String> failedPaths) {
    public boolean isComplete() {
        return failedPaths.isEmpty();
    }
}
