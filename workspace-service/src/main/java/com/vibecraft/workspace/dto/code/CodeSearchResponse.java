package com.vibecraft.workspace.dto.code;

import java.util.List;

/**
 * Search results across a project's files.
 *
 * <p>Handles: the query, how many files and matches were found, the per-file results, and whether the overall cap was
 * hit - so the client can say there are more rather than implying it found everything.
 */
public record CodeSearchResponse(
        String query,
        int fileCount,
        int matchCount,
        boolean truncated,
        List<CodeSearchFileResult> files
) {
}
