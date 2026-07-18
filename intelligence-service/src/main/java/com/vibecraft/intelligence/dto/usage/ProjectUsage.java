package com.vibecraft.intelligence.dto.usage;

/** A project's share of the window. {@code deleted} projects still count - the tokens were spent. */
public record ProjectUsage(Long projectId, String name, boolean deleted, long totalTokens, double share) {
}
