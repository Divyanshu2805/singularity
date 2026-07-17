package com.java.vibecraft.dto.usage;

/** A feature's share of the window. {@code share} is 0-1. Includes "UNATTRIBUTED" when there was any. */
public record FeatureUsage(String feature, long totalTokens, long requests, double share) {
}
