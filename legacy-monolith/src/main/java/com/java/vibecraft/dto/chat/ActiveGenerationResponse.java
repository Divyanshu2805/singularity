package com.java.vibecraft.dto.chat;

import java.time.Instant;

/**
 * A response still being generated for the caller in this project - what a refreshed page needs to put the
 * question back on screen and reattach to the answer.
 *
 * @param status {@code RUNNING} while the model writes, {@code SAVING} once it's done and the turn is being stored
 */
public record ActiveGenerationResponse(
        String userMessage,
        Instant startedAt,
        boolean teachingMode,
        String status
) {
}
