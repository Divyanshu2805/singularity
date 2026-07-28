package com.vibecraft.account.dto.subscription;

/**
 * A plan's limits on their own, without the pricing-page presentation.
 *
 * <p>Handles: the plan name, the daily token allowance, the project allowance and the unlimited-AI flag.
 */
public record PlanLimitsResponse(
        String planName,
        Integer maxTokensPerDay,
        Integer maxProjects,
        Boolean unlimitedAi
) {
}
