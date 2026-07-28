package com.vibecraft.intelligence.dto.chat;

import java.time.Instant;

/**
 * A response still being generated for the caller in this project.
 *
 * <p>Handles: the question that started it, when it started, whether teaching mode was on, and whether the model is
 * still writing or the turn is being saved - enough for a refreshed page to put the question back on screen and
 * reattach to the answer.
 */
public record ActiveGenerationResponse(
        String userMessage,
        Instant startedAt,
        boolean teachingMode,
        String status
) {
}
