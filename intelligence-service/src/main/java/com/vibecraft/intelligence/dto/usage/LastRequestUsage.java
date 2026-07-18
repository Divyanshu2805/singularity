package com.vibecraft.intelligence.dto.usage;

import java.time.Instant;

/** The caller's most recent AI call - what the chat meter's "last reply" line shows. */
public record LastRequestUsage(String feature, Long projectId, int inputTokens, int outputTokens, int totalTokens, Instant at) {
}
