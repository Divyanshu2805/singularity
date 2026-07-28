package com.vibecraft.intelligence.dto.usage;

/**
 * The caller's plan limits on their own.
 *
 * <p>Handles: the plan name, the daily token allowance, the project allowance and whether AI is uncapped.
 */
public record PlanLimitsResponse(
        String planName,
        Integer maxTokensPerDay,
        Integer maxProjects,
        Boolean unlimitedAi
) {
}
