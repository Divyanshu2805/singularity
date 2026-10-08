package com.singularity.intelligence.llm;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Set;

/**
 * Takes out a backslash a model left at the end of a line of code, where one can never be.
 *
 * <p>Handles: walking a JavaScript or TypeScript file far enough to know, at each line's end, whether it is in code,
 * in a string, in a template literal or in a comment; dropping a backslash that ends a line of code; leaving every
 * other backslash exactly where it is; and saying how many it removed.
 *
 * <p>It exists because of one real turn. Asked to add a dark theme, the model rewrote nine whole files, and in the two
 * longest a single line came back with a backslash after it - {@code onClick={() => handleBatchDownload('all')}\} in
 * one, {@code useState<InquiryData>({\} in the other. Each is a syntax error on its own, so the saved project would
 * not compile and the preview showed the bundler's stack trace. Nothing between the model and storage parses the code
 * it writes: the import check reads import lines, and the type-check before publishing is off by default.
 *
 * <p>Outside a string, a template literal and a comment, a backslash followed by the end of the line means nothing in
 * these languages, so taking it out cannot change what correct code does. Inside a string or a template literal it is
 * a line continuation and is left alone; inside a comment it is harmless and is left alone too.
 *
 * <p>The walk is deliberately not a parser. It does not know a regular expression from a division or the text of a
 * JSX element from code, so a lone quote in either - the apostrophe in {@code <p>Don't</p>} - reads as a string that
 * runs to the end of its line. That errs towards believing it is inside a string, which is the direction that leaves
 * a backslash alone. Only files with a JavaScript or TypeScript extension are looked at.
 */
public final class StrayBackslashes {

    public record Tidied(String content, int removed) {
    }

    private enum State {
        CODE, SINGLE_QUOTED, DOUBLE_QUOTED, TEMPLATE, LINE_COMMENT, BLOCK_COMMENT
    }

    private static final Set<String> EXTENSIONS = Set.of("ts", "tsx", "js", "jsx", "mjs", "cjs");

    private StrayBackslashes() {
    }

    public static Tidied remove(String path, String content) {
        if (content == null || content.indexOf('\\') < 0 || !isScript(path)) {
            return new Tidied(content, 0);
        }

        StringBuilder tidy = new StringBuilder(content.length());
        Deque<Integer> templateBraces = new ArrayDeque<>();
        State state = State.CODE;
        int braces = 0;
        int removed = 0;

        for (int at = 0; at < content.length(); at++) {
            char character = content.charAt(at);
            char next = at + 1 < content.length() ? content.charAt(at + 1) : '\0';

            switch (state) {
                case CODE -> {
                    if (character == '\\' && endsItsLine(content, at + 1)) {
                        int lineEnd = lineEnd(content, at + 1);
                        while (!tidy.isEmpty() && isBlank(tidy.charAt(tidy.length() - 1))) {
                            tidy.setLength(tidy.length() - 1);
                        }
                        at = lineEnd - 1;
                        removed++;
                        continue;
                    }
                    if (character == '\'') {
                        state = State.SINGLE_QUOTED;
                    } else if (character == '"') {
                        state = State.DOUBLE_QUOTED;
                    } else if (character == '`') {
                        templateBraces.push(braces);
                        braces = 0;
                        state = State.TEMPLATE;
                    } else if (character == '/' && next == '/') {
                        state = State.LINE_COMMENT;
                    } else if (character == '/' && next == '*') {
                        state = State.BLOCK_COMMENT;
                    } else if (character == '{') {
                        braces++;
                    } else if (character == '}') {
                        if (braces == 0 && !templateBraces.isEmpty()) {
                            state = State.TEMPLATE;
                        } else if (braces > 0) {
                            braces--;
                        }
                    }
                }
                case SINGLE_QUOTED, DOUBLE_QUOTED -> {
                    if (character == '\\' && next != '\0') {
                        tidy.append(character).append(next);
                        at++;
                        continue;
                    }
                    if (character == '\n' || character == (state == State.SINGLE_QUOTED ? '\'' : '"')) {
                        state = State.CODE;
                    }
                }
                case TEMPLATE -> {
                    if (character == '\\' && next != '\0') {
                        tidy.append(character).append(next);
                        at++;
                        continue;
                    }
                    if (character == '`') {
                        braces = templateBraces.isEmpty() ? 0 : templateBraces.pop();
                        state = State.CODE;
                    } else if (character == '$' && next == '{') {
                        tidy.append(character).append(next);
                        at++;
                        braces = 0;
                        state = State.CODE;
                        continue;
                    }
                }
                case LINE_COMMENT -> {
                    if (character == '\n') {
                        state = State.CODE;
                    }
                }
                case BLOCK_COMMENT -> {
                    if (character == '*' && next == '/') {
                        tidy.append(character).append(next);
                        at++;
                        state = State.CODE;
                        continue;
                    }
                }
            }
            tidy.append(character);
        }
        return removed == 0 ? new Tidied(content, 0) : new Tidied(tidy.toString(), removed);
    }

    private static boolean isScript(String path) {
        if (path == null) {
            return false;
        }
        int dot = path.lastIndexOf('.');
        return dot >= 0 && EXTENSIONS.contains(path.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private static boolean isBlank(char character) {
        return character == ' ' || character == '\t';
    }

    private static int lineEnd(String content, int from) {
        int at = from;
        while (at < content.length() && content.charAt(at) != '\n' && content.charAt(at) != '\r') {
            at++;
        }
        return at;
    }

    private static boolean endsItsLine(String content, int from) {
        for (int at = from; at < content.length(); at++) {
            char character = content.charAt(at);
            if (character == '\n') {
                return true;
            }
            if (!isBlank(character) && character != '\r') {
                return false;
            }
        }
        return true;
    }
}
