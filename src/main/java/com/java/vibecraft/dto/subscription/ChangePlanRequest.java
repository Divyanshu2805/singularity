package com.java.vibecraft.dto.subscription;

import jakarta.validation.constraints.NotNull;

/**
 * Move an existing subscription to another plan - including the free plan, which means "cancel at the end of
 * this period", and the plan already held, which means "undo that cancellation".
 */
public record ChangePlanRequest(

        @NotNull(message = "Plan id is required")
        Long planId
) {
}
