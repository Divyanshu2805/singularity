package com.vibecraft.workspace.dto.code;

import java.util.List;

/**
 * Every match found in one file, in line order.
 *
 * <p>Handles: the file's path, its matches, and whether the per-file cap cut them short.
 */
public record CodeSearchFileResult(
        String path,
        List<CodeSearchMatch> matches,
        boolean truncated
) {
}
