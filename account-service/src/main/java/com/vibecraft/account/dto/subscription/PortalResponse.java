package com.vibecraft.account.dto.subscription;

/**
 * Where to send the browser to manage its own billing.
 *
 * <p>Handles: the Stripe-hosted customer-portal URL.
 */
public record PortalResponse(String portalUrl) {
}
