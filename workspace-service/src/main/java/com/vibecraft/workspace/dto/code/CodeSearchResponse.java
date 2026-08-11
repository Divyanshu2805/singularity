package com.vibecraft.workspace.dto.code;

import java.util.List;

/**
 * Search results across a project's files.
 *
 * <p>Handles: the query, how many files and matches were found, the per-file results, whether the overall cap was
 * hit - so the client can say there are more rather than implying it found everything - and which searchable files,
 * if any, could not actually be read. That last one is what tells "no matches" and "some files were unavailable"
 * apart; without it, a storage hiccup mid-search looks exactly like a clean answer of zero.
 */
public record CodeSearchResponse(
        String query,
        int fileCount,
        int matchCount,
        boolean truncated,
        List<CodeSearchFileResult> files,
        List<String> unavailablePaths
) {
}
