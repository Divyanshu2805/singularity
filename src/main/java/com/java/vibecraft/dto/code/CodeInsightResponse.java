package com.java.vibecraft.dto.code;

/** The model's plain-markdown reply. No tags, no file edits - this endpoint only ever produces text. */
public record CodeInsightResponse(
        String answer
) {
}
