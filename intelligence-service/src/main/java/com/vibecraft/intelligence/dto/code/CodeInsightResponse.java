package com.vibecraft.intelligence.dto.code;

/**
 * The model's plain-markdown reply to an explain or ask.
 *
 * <p>Handles: the text. No tags and no file edits - this endpoint only ever produces prose.
 */
public record CodeInsightResponse(
        String answer
) {
}
