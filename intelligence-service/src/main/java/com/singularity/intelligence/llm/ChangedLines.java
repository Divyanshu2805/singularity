package com.singularity.intelligence.llm;

import java.util.ArrayList;
import java.util.List;

/**
 * What a step changed in a file, as the lines a lesson is written about.
 *
 * <p>Handles: comparing a file's previous version with the one a turn saved, line by line, and writing out only the
 * parts that differ - each with a few unchanged lines around it, every line that is still in the file carrying its
 * number there, added lines marked {@code +} and removed lines marked {@code -} - and writing out a whole file with
 * its lines numbered when there is nothing to compare it with.
 *
 * <p>The numbers are the new file's, counted the way the editor counts them, because a lesson points at lines by
 * number and the editor scrolls to them. A removed line has no number: it is not in the file any more.
 *
 * <p>Lines are compared without their trailing spaces, so a line whose only change is invisible is not taught. The
 * comparison is a longest-common-subsequence over what is left after the shared start and end are set aside, which
 * is small for the edits a build step makes. Two versions with too much between them to compare that way are treated
 * as one replaced block rather than held in a table of millions of cells.
 */
public final class ChangedLines {

    private static final int MAX_COMPARED_CELLS = 1_500_000;

    private ChangedLines() {
    }

    private enum Kind { SAME, ADDED, REMOVED }

    private record Line(Kind kind, int number, String text) {
    }

    public static List<String> linesOf(String text) {
        if (text == null) {
            return List.of();
        }
        String[] raw = text.replace("\r\n", "\n").split("\n", -1);
        int end = raw.length;
        while (end > 0 && raw[end - 1].isBlank()) {
            end--;
        }
        List<String> lines = new ArrayList<>(end);
        for (int i = 0; i < end; i++) {
            lines.add(raw[i].stripTrailing());
        }
        return lines;
    }

    public static String numbered(String text) {
        List<String> lines = linesOf(text);
        int width = String.valueOf(Math.max(lines.size(), 1)).length();
        StringBuilder block = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            block.append(String.format("%" + width + "d | %s\n", i + 1, lines.get(i)));
        }
        return block.toString().stripTrailing();
    }

    public static String between(String before, String after, int context) {
        List<Line> lines = compare(linesOf(before), linesOf(after));
        int width = String.valueOf(Math.max(linesOf(after).size(), 1)).length();
        StringBuilder block = new StringBuilder();
        int shownUntil = -1;

        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).kind() == Kind.SAME) {
                continue;
            }
            int last = i;
            int gap = 0;
            for (int next = i + 1; next < lines.size() && gap <= context * 2; next++) {
                if (lines.get(next).kind() == Kind.SAME) {
                    gap++;
                } else {
                    last = next;
                    gap = 0;
                }
            }
            int from = Math.max(Math.max(0, i - context), shownUntil + 1);
            int to = Math.min(lines.size() - 1, last + context);
            if (!block.isEmpty()) {
                block.append("...\n");
            }
            for (int at = from; at <= to; at++) {
                Line line = lines.get(at);
                String mark = line.kind() == Kind.ADDED ? "+" : line.kind() == Kind.REMOVED ? "-" : " ";
                String number = line.kind() == Kind.REMOVED ? " ".repeat(width) : String.format("%" + width + "d", line.number());
                block.append(mark).append(' ').append(number).append(" | ").append(line.text()).append('\n');
            }
            shownUntil = to;
            i = last;
        }
        return block.toString().stripTrailing();
    }

    private static List<Line> compare(List<String> before, List<String> after) {
        int start = 0;
        while (start < before.size() && start < after.size() && before.get(start).equals(after.get(start))) {
            start++;
        }
        int beforeEnd = before.size();
        int afterEnd = after.size();
        while (beforeEnd > start && afterEnd > start && before.get(beforeEnd - 1).equals(after.get(afterEnd - 1))) {
            beforeEnd--;
            afterEnd--;
        }

        List<Line> lines = new ArrayList<>(after.size() + (beforeEnd - start));
        for (int i = 0; i < start; i++) {
            lines.add(new Line(Kind.SAME, i + 1, after.get(i)));
        }
        middle(before.subList(start, beforeEnd), after.subList(start, afterEnd), start, lines);
        for (int i = afterEnd; i < after.size(); i++) {
            lines.add(new Line(Kind.SAME, i + 1, after.get(i)));
        }
        return lines;
    }

    private static void middle(List<String> before, List<String> after, int offset, List<Line> lines) {
        int rows = before.size();
        int columns = after.size();
        if ((long) rows * columns > MAX_COMPARED_CELLS) {
            before.forEach(text -> lines.add(new Line(Kind.REMOVED, 0, text)));
            for (int j = 0; j < columns; j++) {
                lines.add(new Line(Kind.ADDED, offset + j + 1, after.get(j)));
            }
            return;
        }

        int[][] common = new int[rows + 1][columns + 1];
        for (int i = rows - 1; i >= 0; i--) {
            for (int j = columns - 1; j >= 0; j--) {
                common[i][j] = before.get(i).equals(after.get(j))
                        ? common[i + 1][j + 1] + 1
                        : Math.max(common[i + 1][j], common[i][j + 1]);
            }
        }

        int i = 0;
        int j = 0;
        while (i < rows || j < columns) {
            if (i < rows && j < columns && before.get(i).equals(after.get(j))) {
                lines.add(new Line(Kind.SAME, offset + j + 1, after.get(j)));
                i++;
                j++;
            } else if (i < rows && (j == columns || common[i + 1][j] >= common[i][j + 1])) {
                lines.add(new Line(Kind.REMOVED, 0, before.get(i)));
                i++;
            } else {
                lines.add(new Line(Kind.ADDED, offset + j + 1, after.get(j)));
                j++;
            }
        }
    }
}
