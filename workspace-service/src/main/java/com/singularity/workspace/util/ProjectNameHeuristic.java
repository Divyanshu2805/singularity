package com.singularity.workspace.util;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * What a project made from a typed description is called, and the title the app shows for it.
 *
 * <p>Handles: the name - one or two words, what the app is called - and the summary - the title, at most eight words,
 * what the app is. Each is taken from a suggestion when there is one (the idea interview's model writes both, and a
 * model writes the title of a project that has none) and cut to size. The name is made from the description itself
 * when nothing was suggested: stripping the leading filler people write ("can you build me a..."), cutting at the
 * first clause boundary, capping the word count, dropping a dangling connector word so it does not end mid-phrase,
 * capitalising it and capping its length - falling back to a generic name if nothing usable is left. The title is
 * not: with no suggestion it stays empty, and the app shows the name until a model has written one.
 *
 * <p>The title used to be made from the description's first sentence too ("A digital guestbook that lets anyone
 * visiting"). Nothing passed the interview's suggestion on, so every project had one of those and no screen showed
 * it. Once the title became what the sidebar reads, a cut sentence was worse than the name, and an empty title is
 * what tells the app that a model should write one.
 *
 * <p>A name was once the first five words of the description, which made "Guestbook everyone who opens" the heading
 * of a project's page and the start of its published link. Two words is the limit now because the name is used as a
 * name - in the link, as the repository - and the longer line people read has its own field.
 *
 * <p>This service makes no AI call and carries no model dependency: a suggestion arrives in the request, written by
 * intelligence-service and passed on by the browser, so it is the caller's own text and is treated as that - trimmed
 * to one line, stripped of control characters and held to the same limits as anything made here.
 */
public final class ProjectNameHeuristic {

    static final int MAX_NAME_WORDS = 2;
    static final int MAX_SUMMARY_WORDS = 8;
    private static final int MAX_NAME_LENGTH = 40;
    private static final int MAX_SUMMARY_LENGTH = 100;
    private static final String FALLBACK_NAME = "Untitled project";

    private static final Pattern LEADING_FILLER = Pattern.compile(
            "^(?:(?:please|can you|could you|i want(?: to)?|i need|i'd like(?: to)?|help me|let's|lets|build|create|make|"
                    + "generate|design|develop|code|write|me|us|a|an|the|new)(?:\\s+|$))+",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DESCRIPTION_BOUNDARY = Pattern.compile(
            "\\s+(?:that|which|where|so that)\\s+|[,.;:!?\\n]", Pattern.CASE_INSENSITIVE);
    private static final Set<String> TRAILING_STOPWORDS = Set.of(
            "and", "or", "with", "for", "to", "of", "in", "on", "the", "a", "an", "my", "our", "using", "by",
            "that", "which", "where", "who", "can", "is", "are");

    private ProjectNameHeuristic() {
    }

    /** The suggested name cut to two words, or one made from the description when nothing usable was suggested. */
    public static String nameFrom(String suggested, String prompt) {
        String name = finish(wordsOf(oneLine(suggested)), MAX_NAME_WORDS, MAX_NAME_LENGTH);
        return name.isBlank() ? nameFor(prompt) : name;
    }

    /** The suggested title cut to eight words, or null when nothing usable was suggested. */
    public static String summaryFrom(String suggested) {
        String summary = finish(wordsOf(oneLine(suggested)), MAX_SUMMARY_WORDS, MAX_SUMMARY_LENGTH);
        return summary.isBlank() ? null : summary;
    }

    public static String nameFor(String prompt) {
        String subject = LEADING_FILLER.matcher(briefSubject(prompt)).replaceFirst("");
        subject = DESCRIPTION_BOUNDARY.split(subject, 2)[0];
        String name = finish(wordsOf(subject), MAX_NAME_WORDS, MAX_NAME_LENGTH);
        return name.isBlank() ? FALLBACK_NAME : name;
    }

    private static String briefSubject(String prompt) {
        String text = prompt == null ? "" : prompt.strip();
        return text.replaceFirst("^\\*\\*Build:\\*\\*\\s*", "");
    }

    private static String oneLine(String text) {
        if (text == null) {
            return "";
        }
        String first = text.lines().map(String::strip).filter(line -> !line.isEmpty()).findFirst().orElse("");
        return first.replaceAll("\\p{Cntrl}", " ").replaceAll("[*_`#\"]", "").strip();
    }

    private static List<String> wordsOf(String text) {
        return Arrays.stream(text.split("\\s+")).filter(word -> !word.isBlank()).toList();
    }

    private static String finish(List<String> words, int maxWords, int maxLength) {
        List<String> kept = new ArrayList<>(words.subList(0, Math.min(words.size(), maxWords)));
        while (!kept.isEmpty() && words.size() > kept.size() && TRAILING_STOPWORDS.contains(kept.getLast().toLowerCase())) {
            kept.removeLast();
        }
        if (kept.isEmpty()) {
            return "";
        }
        String text = String.join(" ", kept).replaceAll("[,.;:!?]+$", "");
        if (text.isEmpty()) {
            return "";
        }
        text = Character.toUpperCase(text.charAt(0)) + text.substring(1);
        return text.length() <= maxLength ? text : text.substring(0, maxLength).strip();
    }
}
