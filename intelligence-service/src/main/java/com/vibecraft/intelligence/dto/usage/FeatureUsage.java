package com.vibecraft.intelligence.dto.usage;

/**
 * A feature's share of a usage window.
 *
 * <p>Handles: its tokens, its request count and its share of the total, which runs from 0 to 1. Includes the
 * unattributed bucket when there was any.
 */
public record FeatureUsage(String feature, long totalTokens, long requests, double share) {
}
