package com.java.vibecraft.dto.subscription;

import jakarta.validation.constraints.NotNull;

public record CheckoutRequest(

        @NotNull(message = "Plan id is required")
        Long planId
) {
}
