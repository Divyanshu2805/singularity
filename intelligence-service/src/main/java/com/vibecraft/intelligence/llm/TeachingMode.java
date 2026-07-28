package com.vibecraft.intelligence.llm;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Whether a generation should explain itself as it builds, and what this learner has already been taught.
 *
 * <p>Handles: the per-request toggle and the concept list read back from the learner's earlier lessons, so the model
 * can use those names without explaining the basics for the twentieth time.
 *
 * <p>The concept strings were written by the model on an earlier turn and go back into a system prompt, so they are
 * flattened to one line, stripped of control characters and quoting, length-capped and deduplicated
 * case-insensitively rather than trusted as they are. The list is capped so it cannot crowd out the rest of the
 * prompt. Nothing about the toggle is stored server-side.
 */
public record TeachingMode(boolean enabled, List<String> conceptsAlreadyTaught) {

    public static final int MAX_CONCEPTS_IN_PROMPT = 40;

    public static final int RECENT_LESSONS_TO_READ = 60;

    static final int MAX_CONCEPT_LENGTH = 60;

    private static final TeachingMode OFF = new TeachingMode(false, List.of());

    public TeachingMode {
        conceptsAlreadyTaught = enabled ? tidy(conceptsAlreadyTaught) : List.of();
    }

    public static TeachingMode off() {
        return OFF;
    }

    public static TeachingMode on(List<String> lessonConcepts) {
        return new TeachingMode(true, lessonConcepts);
    }

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
