package com.vibecraft.account.dto.subscription;

/**
 * Where to send the browser to pay.
 *
 * <p>Handles: the Stripe-hosted checkout URL.
 */
public record CheckoutResponse(String checkoutUrl) {
}
