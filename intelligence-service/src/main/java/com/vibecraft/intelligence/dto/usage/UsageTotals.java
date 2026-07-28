package com.vibecraft.intelligence.dto.usage;

/**
 * Sums over a usage window.
 *
 * <p>Handles: the token split, the total and the number of AI calls - so average cost per call is the total over the
 * requests.
 */
public record UsageTotals(long inputTokens, long outputTokens, long totalTokens, long requests) {
}
