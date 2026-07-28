package com.vibecraft.account.dto.subscription;

import jakarta.validation.constraints.NotNull;

/**
 * Move an existing subscription to another plan.
 *
 * <p>Handles: the target plan id. The free plan means "cancel at the end of this period", and the plan already held
 * means "undo that cancellation".
 */
public record ChangePlanRequest(

        @NotNull(message = "Plan id is required")
        Long planId
) {
}
