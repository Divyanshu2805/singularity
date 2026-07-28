package com.vibecraft.account.dto.subscription;

import jakarta.validation.constraints.NotNull;

/**
 * Which plan to start a Stripe Checkout session for.
 *
 * <p>Handles: the plan id. Only someone with no subscription goes through checkout; everyone else changes plan in
 * place.
 */
public record CheckoutRequest(

        @NotNull(message = "Plan id is required")
        Long planId
) {
}
