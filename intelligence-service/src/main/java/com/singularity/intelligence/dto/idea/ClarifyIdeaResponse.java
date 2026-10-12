package com.singularity.intelligence.dto.idea;

import java.util.List;

/**
 * The interview to put in front of the user.
 *
 * <p>Handles: the questions with their options, whether the model wrote them for this idea, and - when it did - what
 * it would call the app (one or two words) and a line saying what the app is (at most eight), both null otherwise.
 *
 * <p>{@code tailored} is what lets the client tell two things apart that an empty or generic list alone cannot: a
 * model that read the idea and decided it needs no questions (tailored, empty - go straight to building), and a model
 * that could not be reached, where the questions are the fixed general set and the user should be told so rather than
 * shown them as if they were written for their idea.
 */
public record ClarifyIdeaResponse(
        List<ClarifyingQuestion> questions,
        boolean tailored,
        String name,
        String summary
) {
}
