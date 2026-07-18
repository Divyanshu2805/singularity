package com.vibecraft.intelligence.dto.code;

import java.time.Instant;

/**
 * A saved exchange, as the panel replays it: the question (with the block it was about, if any) and the
 * answer. {@code id} is what "delete this one" deletes.
 */
public record CodeNoteResponse(
        Long id,
        String question,
        String answer,
        CodeNoteSelection selection,
        Instant createdAt
) {
}
