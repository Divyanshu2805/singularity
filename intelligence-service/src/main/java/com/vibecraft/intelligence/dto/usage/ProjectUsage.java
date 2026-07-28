package com.vibecraft.intelligence.dto.usage;

/**
 * A project's share of a usage window.
 *
 * <p>Handles: its name, its tokens and its share. A deleted project still counts - the tokens were spent.
 */
public record ProjectUsage(Long projectId, String name, boolean deleted, long totalTokens, double share) {
}
