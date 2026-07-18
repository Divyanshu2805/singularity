package com.vibecraft.workspace.dto.code;

import java.util.List;

/** Every match found in one file, in line order. */
public record CodeSearchFileResult(
        String path,
        List<CodeSearchMatch> matches,
        /** True when this file had more matches than the per-file cap allowed us to return. */
        boolean truncated
) {
}
