package com.vibecraft.workspace.util;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Turns the description a user types on the dashboard into a short plain name (e.g. "Habit tracker with daily
 * streaks"), without an AI call. This is exactly the deterministic fallback legacy-monolith's
 * {@code llm.ProjectNameGenerator} already falls back to when its AI call fails - ported here as workspace-
 * service's *only* naming strategy, since an AI-quality name is intelligence-service's concern once it exists
 * (this deliberately carries no Spring AI/OpenRouter dependency). See docs/migration/phase-2-workspace-service.md's Phase 2 entry.
 */
public final class ProjectNameHeuristic {

    private static final int MAX_NAME_LENGTH = 60;
    private static final int MAX_WORDS = 5;
    private static final String FALLBACK_NAME = "Untitled project";

    private static final Pattern LEADING_FILLER = Pattern.compile(
            "^(?:(?:please|can you|could you|i want(?: to)?|i need|i'd like(?: to)?|help me|let's|lets|build|create|make|"
                    + "generate|design|develop|code|write|me|us|a|an|the|new)\\s+)+",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DESCRIPTION_BOUNDARY = Pattern.compile(
            "\\s+(?:that|which|where|so that)\\s+|[,.;:!?\\n]", Pattern.CASE_INSENSITIVE);
    // A name shouldn't end mid-phrase, e.g. "Todo app with drag and".
    private static final Set<String> TRAILING_STOPWORDS = Set.of(
            "and", "or", "with", "for", "to", "of", "in", "on", "the", "a", "an", "my", "our", "using", "by");

    private ProjectNameHeuristic() {
    }

    public static String nameFor(String prompt) {
        String subject = LEADING_FILLER.matcher(prompt.strip()).replaceFirst("");
        subject = DESCRIPTION_BOUNDARY.split(subject, 2)[0];
        List<String> words = Arrays.stream(subject.split("\\s+")).filter(word -> !word.isBlank()).toList();
        String name = finish(words);
        return name.isBlank() ? FALLBACK_NAME : name;
    }

    /** Caps the word count, drops dangling connector words, capitalizes the first letter, and caps the length. */
    private static String finish(List<String> words) {
        List<String> kept = new ArrayList<>(words.subList(0, Math.min(words.size(), MAX_WORDS)));
        while (!kept.isEmpty() && TRAILING_STOPWORDS.contains(kept.getLast().toLowerCase())) {
            kept.removeLast();
        }
        if (kept.isEmpty()) {
            return "";
        }
        String name = String.join(" ", kept);
        name = Character.toUpperCase(name.charAt(0)) + name.substring(1);
        return name.length() <= MAX_NAME_LENGTH ? name : name.substring(0, MAX_NAME_LENGTH).strip();
    }
}
