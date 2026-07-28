package com.vibecraft.workspace.dto.code;

/**
 * One matching line.
 *
 * <p>Handles: the line number, the text to display, and where within that text the match sits so the client can
 * highlight it without re-running the search.
 *
 * <p>The column refers to the text as returned here - already trimmed of leading indentation and possibly windowed
 * around the match - not to the raw line in the file.
 */
public record CodeSearchMatch(
        int line,
        String text,
        int column,
        int length
) {
}
