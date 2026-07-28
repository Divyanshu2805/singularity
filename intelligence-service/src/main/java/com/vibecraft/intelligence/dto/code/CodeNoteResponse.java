package com.vibecraft.intelligence.dto.code;

import java.time.Instant;

/**
 * A saved exchange, as the notes panel replays it.
 *
 * <p>Handles: the question with the block it was about (if any), the answer, when it was saved, and the id that
 * "delete this one" deletes.
 */
public record CodeNoteResponse(
        Long id,
        String question,
        String answer,
        CodeNoteSelection selection,
        Instant createdAt
) {
}
