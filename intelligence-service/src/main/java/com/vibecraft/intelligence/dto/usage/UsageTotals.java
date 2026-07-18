package com.vibecraft.intelligence.dto.usage;

/** Sums over a window. {@code requests} is the number of AI calls, so average cost per call is {@code total / requests}. */
public record UsageTotals(long inputTokens, long outputTokens, long totalTokens, long requests) {
}
