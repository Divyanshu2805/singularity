package com.java.vibecraft.dto.subscription;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The Stripe Checkout session the browser just came back from.
 *
 * <p>The id is not trusted as proof of anything: the server fetches the session from Stripe and checks it was
 * actually paid and that its {@code user_id} metadata is the caller's, so pasting somebody else's session id
 * activates nothing.
 */
public record ConfirmCheckoutRequest(

        @NotBlank(message = "Checkout session id is required")
        @Size(max = 255, message = "Checkout session id should not be more than 255 characters long")
        String sessionId
) {
}
