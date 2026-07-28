package com.vibecraft.common.dto;

/**
 * account-service's plan catalogue row, as it crosses its internal API.
 *
 * <p>Handles: the effective limits behind every quota check in the system - project count, daily tokens, concurrent
 * previews - plus the plan's display name and its unlimited-AI flag. The limit is always account-service's; the thing
 * being counted belongs to whichever service asks.
 */
public record PlanDto(
        Long id,
        String name,
        int maxProjects,
        int maxTokensPerDay,
        int maxPreviews,
        boolean unlimitedAi
) {
}
