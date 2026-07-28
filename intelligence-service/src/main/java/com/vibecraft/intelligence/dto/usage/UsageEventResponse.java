package com.vibecraft.intelligence.dto.usage;

import java.time.Instant;

/**
 * One AI call in the activity table.
 *
 * <p>Handles: when it happened, what it was for, its token split, and the project it belonged to - whose name is null
 * for calls made before a project existed.
 */
public record UsageEventResponse(
        Long id,
        Instant createdAt,
        Long projectId,
        String projectName,
        String feature,
        int inputTokens,
        int outputTokens,
        int totalTokens
) {
}
