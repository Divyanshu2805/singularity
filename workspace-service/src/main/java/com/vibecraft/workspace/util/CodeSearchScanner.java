package com.vibecraft.workspace.util;

import com.vibecraft.workspace.dto.code.CodeSearchFileResult;
import com.vibecraft.workspace.dto.code.CodeSearchMatch;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Finds a plain-text query inside one file's content.
 *
 * <p>Handles: case-insensitive line-by-line matching, trimming each hit's indentation for display and shifting the
 * match column with it, windowing a very long line around the match so the hit stays visible, and stopping at a cap
 * while reporting that it did.
 *
 * <p>Pure and storage-free on purpose: the service around it deals with object storage and skipping binaries, while
 * the part with all the off-by-one risk stays directly testable. The query is matched literally rather than as a
 * regex, because people searching code type things like useState( and [0], and having those silently mean something
 * else is worse than not supporting patterns at all.
 */
public final class CodeSearchScanner {

    public static final int MAX_LINE_CHARS = 240;

    private CodeSearchScanner() {
    }

    public static CodeSearchFileResult scan(String path, String content, String query, int maxMatches) {
        if (content == null || content.isEmpty() || query == null || query.isEmpty()) {
            return null;
        }

        String needle = query.toLowerCase(Locale.ROOT);
        List<CodeSearchMatch> matches = new ArrayList<>();
        boolean truncated = false;

        String[] lines = content.split("\n", -1);
        for (int index = 0; index < lines.length; index++) {
            String raw = stripCarriageReturn(lines[index]);
            int hit = raw.toLowerCase(Locale.ROOT).indexOf(needle);
            if (hit < 0) {
                continue;
            }
            if (matches.size() == maxMatches) {
                truncated = true;
                break;
            }

            int indent = indentWidth(raw);
            String text = raw.substring(indent);
            int column = hit - indent;

            if (text.length() > MAX_LINE_CHARS) {
                int from = Math.max(0, Math.min(column - MAX_LINE_CHARS / 3, text.length() - MAX_LINE_CHARS));
                text = text.substring(from, Math.min(text.length(), from + MAX_LINE_CHARS));
                column -= from;
            }

            matches.add(new CodeSearchMatch(index + 1, text, Math.max(column, 0), query.length()));
        }

        return matches.isEmpty() ? null : new CodeSearchFileResult(path, List.copyOf(matches), truncated);
    }

    private static String stripCarriageReturn(String line) {
        return line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
    }

    private static int indentWidth(String line) {
        int index = 0;
        while (index < line.length() && Character.isWhitespace(line.charAt(index))) {
            index++;
        }
        return index == line.length() ? 0 : index;
    }
}
