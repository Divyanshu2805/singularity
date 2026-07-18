package com.vibecraft.workspace.dto.code;

import java.util.List;

/**
 * Search results across a project's files. {@code truncated} means the overall match cap was hit, so there are
 * more results than these - the client says so rather than implying it found everything.
 */
public record CodeSearchResponse(
        String query,
        int fileCount,
        int matchCount,
        boolean truncated,
        List<CodeSearchFileResult> files
) {
}
