package com.vibecraft.intelligence.dto.idea;

import java.util.List;

/**
 * The interview to put in front of the user.
 *
 * <p>Handles: the tailored questions with their options.
 */
public record ClarifyIdeaResponse(
        List<ClarifyingQuestion> questions
) {
}
