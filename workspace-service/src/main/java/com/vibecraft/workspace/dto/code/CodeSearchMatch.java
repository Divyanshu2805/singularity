package com.vibecraft.workspace.dto.code;

/**
 * One matching line. {@code column} is the 0-based offset of the match within {@code text}, so the client can
 * highlight the hit without re-running the search; it refers to {@code text} as returned here (already trimmed
 * of leading whitespace), not to the raw line in the file.
 */
public record CodeSearchMatch(
        int line,
        String text,
        int column,
        int length
) {
}
