package com.vibecraft.common.dto;

/** account-service's plan catalogue row, as served over its internal API — the source of truth every quota check reads. */
public record PlanDto(
        Long id,
        String name,
        int maxProjects,
        int maxTokensPerDay,
        int maxPreviews,
        boolean unlimitedAi
) {
}
