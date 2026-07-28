package com.vibecraft.intelligence.dto.usage;

import com.vibecraft.intelligence.enums.UsageFeature;

/**
 * One AI call's usage, on its way to being recorded.
 *
 * <p>Handles: the user, the project if there is one, what the call was for and its token split.
 *
 * <p>The user id is always explicit. Two call sites once lost usage by reading the caller from the security context
 * at completion time: a stream's completion runs off the request thread, where there is no signed-in user, so the
 * write failed and was swallowed. Capture the id on the request thread, then pass it.
 */
public record UsageRecord(
        Long userId,
        Long projectId,
        UsageFeature feature,
        int inputTokens,
        int outputTokens,
        int totalTokens
) {
}
