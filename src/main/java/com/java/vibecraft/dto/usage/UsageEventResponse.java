package com.java.vibecraft.dto.usage;

import java.time.Instant;

/** One AI call in the activity table. {@code projectName} is null for calls made before a project existed. */
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
