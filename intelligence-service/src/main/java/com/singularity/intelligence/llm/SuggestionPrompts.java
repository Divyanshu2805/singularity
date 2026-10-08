package com.singularity.intelligence.llm;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The prompt for the suggestions offered under a finished build, and the reading of its answer.
 *
 * <p>Handles: asking for three next steps in the person's own voice, from what they asked for, what the build said
 * it did and which files it touched; and turning the answer into at most three short lines, whatever the model
 * wrapped them in - numbers, bullets, quotes, a sentence of preamble.
 *
 * <p>A suggestion is something the person would send, so it is written as their message ("Add a search box that
 * filters the notes"), not as the assistant's offer ("I could add search"). Clicking one sends it as it stands.
 *
 * <p>The model is given no file contents, only paths. A suggestion needs to know what exists, not how it is written,
 * and a project's files are whatever their authors put in them: nothing a collaborator or a forked project's first
 * author wrote reaches this prompt, so nothing they wrote can end up as a button in someone else's chat.
 *
 * <p>The answer is read defensively because it is shown as buttons. A line that is too long, holds a tag or markup,
 * or is not a request at all is dropped, and fewer than three is a fine answer - no suggestions is better than a
 * strange one.
 */
public final class SuggestionPrompts {

    public static final int MAX_SUGGESTIONS = 3;
    static final int MAX_SUGGESTION_CHARS = 90;
    static final int MIN_SUGGESTION_CHARS = 8;
    static final int MAX_REQUEST_CHARS = 1_500;
    static final int MAX_SAID_CHARS = 600;
    static final int MAX_PATHS = 40;

    private SuggestionPrompts() {
    }

    public static String systemPrompt() {
        return """
            You suggest what to build next in a small React app that an AI builder has just changed for someone who
            may never have written code. You are given what they asked for, what the builder said it did, and the
            files in the project.

            Reply with exactly three suggestions, one per line, and nothing else - no numbers, no bullets, no
            quotation marks, no introduction.

            Each suggestion:
            - is a request the person could send as it stands, starting with a verb: "Add a search box that
              filters the notes", "Let me pin a note to the top";
            - is one small, concrete step that builds on what is there now - something visible in the app;
            - is at most twelve words, in plain language, with no file names and no technical terms;
            - needs no server, account, payment or other app: everything runs in the browser;
            - is different in kind from the other two - one for what the app does, one for how it looks or
              feels, one for a detail that makes it nicer to use.

            Never suggest something the request already asked for or that was listed as left out on purpose.
            """;
    }

    public static String block(String request, String said, List<String> touched, List<String> projectPaths) {
        StringBuilder text = new StringBuilder("What they asked for:\n").append(shortened(request, MAX_REQUEST_CHARS));
        if (said != null && !said.isBlank()) {
            text.append("\n\nWhat the builder said it did:\n").append(shortened(said, MAX_SAID_CHARS));
        }
        if (touched != null && !touched.isEmpty()) {
            text.append("\n\nFiles it wrote or changed:\n").append(String.join("\n", limited(touched)));
        }
        if (projectPaths != null && !projectPaths.isEmpty()) {
            text.append("\n\nFiles in the project:\n").append(String.join("\n", limited(projectPaths)));
        }
        return text.toString();
    }

    public static List<String> parse(String answer) {
        if (answer == null || answer.isBlank()) {
            return List.of();
        }
        Set<String> seen = new LinkedHashSet<>();
        List<String> suggestions = new ArrayList<>();
        for (String raw : answer.split("\\R")) {
            String line = raw.strip()
                    .replaceFirst("^(?:[-*\\u2022]+|\\d+[.)])\\s*", "")
                    .replaceAll("^[\"'\\u201C\\u2018`]+|[\"'\\u201D\\u2019`]+$", "")
                    .replaceAll("\\*\\*", "")
                    .strip();
            if (line.length() < MIN_SUGGESTION_CHARS || line.length() > MAX_SUGGESTION_CHARS) {
                continue;
            }
            if (line.indexOf('<') >= 0 || line.indexOf('>') >= 0 || line.indexOf('`') >= 0 || line.endsWith(":")) {
                continue;
            }
            if (!seen.add(line.toLowerCase(Locale.ROOT))) {
                continue;
            }
            suggestions.add(line.replaceFirst("[.]+$", ""));
            if (suggestions.size() == MAX_SUGGESTIONS) {
                break;
            }
        }
        return suggestions;
    }

    private static List<String> limited(List<String> paths) {
        return paths.size() <= MAX_PATHS ? paths : paths.subList(0, MAX_PATHS);
    }

    private static String shortened(String text, int limit) {
        String stripped = text == null ? "" : text.strip();
        return stripped.length() <= limit ? stripped : stripped.substring(0, limit) + " [...]";
    }
}
