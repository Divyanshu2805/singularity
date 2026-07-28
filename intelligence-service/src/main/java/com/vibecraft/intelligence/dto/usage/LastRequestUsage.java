package com.vibecraft.intelligence.dto.usage;

import java.time.Instant;

/**
 * The caller's most recent AI call.
 *
 * <p>Handles: what it was for, which project, its token split and when - the chat meter's "last reply" line.
 */
public record LastRequestUsage(String feature, Long projectId, int inputTokens, int outputTokens, int totalTokens, Instant at) {
}
