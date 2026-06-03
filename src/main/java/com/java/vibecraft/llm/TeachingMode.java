package com.java.vibecraft.llm;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Whether a generation should explain itself as it builds, and what this learner has already been taught.
 *
 * <p>The toggle arrives per request ({@code ChatRequest.teachingMode}) - nothing about it is stored server-side. The
 * concept list is read back from the learner's earlier {@code LEARN} events so the model can use those names without
 * explaining props for the twentieth time.
 */
public record TeachingMode(boolean enabled, List<String> conceptsAlreadyTaught) {

    /** Enough to steer the model away from repeats without the list crowding out the rest of the prompt. */
    public static final int MAX_CONCEPTS_IN_PROMPT = 40;

    /** How many of a learner's latest lessons to read concepts from - most introduce a few, many introduce none. */
    public static final int RECENT_LESSONS_TO_READ = 60;

    /** A concept is a short name ("Custom hooks"); anything longer is the model misusing the attribute. */
    static final int MAX_CONCEPT_LENGTH = 60;

    private static final TeachingMode OFF = new TeachingMode(false, List.of());

    public TeachingMode {
        conceptsAlreadyTaught = enabled ? tidy(conceptsAlreadyTaught) : List.of();
    }

    public static TeachingMode off() {
        return OFF;
    }

    /**
     * @param lessonConcepts one entry per earlier lesson, most recent first - each the comma-separated concepts that
     *                       lesson introduced (as {@code LlmResponseParser} saves them); the cap keeps the newest
     */
    public static TeachingMode on(List<String> lessonConcepts) {
        return new TeachingMode(true, lessonConcepts);
    }

    /**
     * These strings were written by the model on an earlier turn and go back into a system prompt, so they're
     * flattened to one line each and length-capped rather than trusted as-is. Duplicates that differ only by case
     * collapse to their first (most recent) spelling.
     */
    private static List<String> tidy(List<String> lessonConcepts) {
        if (lessonConcepts == null) return List.of();

        Map<String, String> unique = new LinkedHashMap<>();
        for (String lesson : lessonConcepts) {
            if (lesson == null) continue;
            for (String concept : lesson.split(",")) {
                String flat = concept.replaceAll("[\\p{Cntrl}\"<>]", " ").replaceAll("\\s+", " ").strip();
                if (flat.isEmpty()) continue;
                if (flat.length() > MAX_CONCEPT_LENGTH) flat = flat.substring(0, MAX_CONCEPT_LENGTH).strip();
                unique.putIfAbsent(flat.toLowerCase(Locale.ROOT), flat);
                if (unique.size() == MAX_CONCEPTS_IN_PROMPT) return List.copyOf(unique.values());
            }
        }
        return List.copyOf(unique.values());
    }
}
