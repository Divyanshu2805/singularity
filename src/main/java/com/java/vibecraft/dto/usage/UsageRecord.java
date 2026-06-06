package com.java.vibecraft.dto.usage;

import com.java.vibecraft.enums.UsageFeature;

/**
 * One AI call's usage, handed to {@code UsageService.recordTokenUsage}.
 *
 * <p>{@code userId} is always explicit. Two call sites used to lose usage by reading the caller from the
 * security context at completion time: a stream's {@code doOnComplete} runs off the request thread where there
 * is no signed-in user, so the write failed and was swallowed. Capture the id on the request thread, then pass it.
 */
public record UsageRecord(
        Long userId,
        /** Null when there is no project yet (idea interview, naming). */
        Long projectId,
        UsageFeature feature,
        int inputTokens,
        int outputTokens,
        int totalTokens
) {
}
